import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  biopoolBookingActivity,
  biopoolBookings,
  biopoolServices,
  massageBookings,
  massageProgramBookings,
  massageTechniques,
  reservationPaymentAllocations,
  reservationPaymentAttempts,
  reservationPaymentRequests,
  reservationPayments,
  saunaBookings,
} from "../drizzle/schema";
import { hasCmsPermission } from "../shared/permissions";
import { calculatedPaymentStatus } from "../shared/reservationPayments";
import { ENV } from "./_core/env";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { createGetnetSession, getGetnetSessionInfo, validateGetnetWebhookSignature } from "./getnet";
import { chileLocalDateTimeToUtc } from "./massageNps";
import { syncMassageSale } from "./massageSales";
import { startTherapistAssignmentForBooking } from "./massageTherapistAssignment";
import { lockReservationPaymentScopes } from "./reservationPaymentLinkGuards";
import { commitTransaction, createTransaction, getTransactionStatus, isTransactionApproved } from "./webpay";

export const paymentLinkServiceSchema = z.enum(["massages", "massage_programs", "biopools", "sauna"]);
export type PaymentLinkService = z.infer<typeof paymentLinkServiceSchema>;
type PaymentProvider = "getnet" | "webpay";

const REPLACEABLE_PENDING_METHODS = new Set(["pending_payment", "payment_link", "getnet_link"]);
const REQUEST_LIFETIME_MS = 24 * 60 * 60 * 1000;
const ATTEMPT_LIFETIME_MS = 2 * 60 * 60 * 1000;

export type BookingSnapshot = {
  service: PaymentLinkService;
  reservationId: number;
  provider: PaymentProvider;
  totalClp: number;
  amountPaidClp: number;
  outstandingClp: number;
  status: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  serviceName: string;
  bookingDate: string;
  startTime: string;
};

function publicPaymentUrl(token: string): string {
  if (!ENV.appUrl) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "El CMS no tiene APP_URL configurada" });
  return `${ENV.appUrl.replace(/\/$/, "")}/pagar/${token}`;
}

function dateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

function normalizeContact(value: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

export function samePaymentLinkClient(a: BookingSnapshot, b: BookingSnapshot): boolean {
  const emailA = normalizeContact(a.clientEmail);
  const emailB = normalizeContact(b.clientEmail);
  const phoneA = normalizeContact(a.clientPhone).replace(/\D/g, "");
  const phoneB = normalizeContact(b.clientPhone).replace(/\D/g, "");
  if (emailA && emailB) return emailA === emailB;
  if (phoneA && phoneB) return phoneA === phoneB;
  return normalizeContact(a.clientName) === normalizeContact(b.clientName);
}

export function paymentLinkProviderFor(service: PaymentLinkService): PaymentProvider {
  return service === "massages" || service === "massage_programs" ? "getnet" : "webpay";
}

export function validatePaymentLinkApproval(input: {
  amountClp: number | undefined;
  currency: string | undefined;
  providerReference: string;
  expectedAmountClp: number;
  expectedReference: string;
}): string | null {
  if (!Number.isInteger(input.amountClp) || (input.amountClp ?? 0) <= 0) {
    return "El proveedor no informó un monto CLP válido";
  }
  if (input.currency !== "CLP") return "El proveedor informó una moneda distinta de CLP";
  if (input.amountClp !== input.expectedAmountClp) return "El proveedor informó un monto distinto";
  if (input.providerReference !== input.expectedReference) return "El proveedor informó una referencia distinta";
  return null;
}

function assertCreatePermission(user: any, service: PaymentLinkService): void {
  const permission = service === "massages" || service === "massage_programs"
    ? "massages.manage_payments"
    : service === "biopools"
      ? "biopools.manage_agenda"
      : "sauna.manage_agenda";
  if (!hasCmsPermission(user, permission as any)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No tienes permiso para generar el link de pago de esta reserva" });
  }
}

async function getBookingSnapshot(db: any, service: PaymentLinkService, reservationId: number): Promise<BookingSnapshot> {
  if (service === "massages") {
    const [row] = await db
      .select({
        id: massageBookings.id,
        status: massageBookings.status,
        paymentStatus: massageBookings.paymentStatus,
        originalAmount: massageBookings.originalAmount,
        discountAmount: massageBookings.discountAmount,
        amountPaid: massageBookings.amountPaid,
        clientName: massageBookings.clientName,
        clientEmail: massageBookings.clientEmail,
        clientPhone: massageBookings.clientPhone,
        bookingDate: massageBookings.bookingDate,
        startTime: massageBookings.startTime,
        serviceName: massageTechniques.name,
      })
      .from(massageBookings)
      .leftJoin(massageTechniques, eq(massageBookings.techniqueId, massageTechniques.id))
      .where(eq(massageBookings.id, reservationId))
      .limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Reserva de masaje no encontrada" });
    const totalClp = Math.max(0, Number(row.originalAmount ?? 0) - Number(row.discountAmount ?? 0));
    const payments = await db.select().from(reservationPayments).where(and(
      eq(reservationPayments.module, "massages"),
      eq(reservationPayments.reservationId, reservationId),
    ));
    const detailedPaidClp = payments.filter((payment: any) => payment.status === "paid")
      .reduce((sum: number, payment: any) => sum + payment.amountClp, 0);
    const legacyPaidClp = ["paid", "partially_paid", "refunded"].includes(row.paymentStatus)
      ? Math.max(0, Number(row.amountPaid ?? 0) - detailedPaidClp)
      : 0;
    const amountPaidClp = detailedPaidClp + legacyPaidClp;
    return {
      service,
      reservationId,
      provider: "getnet",
      totalClp,
      amountPaidClp,
      outstandingClp: Math.max(0, totalClp - amountPaidClp),
      status: row.status,
      clientName: row.clientName,
      clientEmail: row.clientEmail,
      clientPhone: row.clientPhone,
      serviceName: row.serviceName ?? "Masaje",
      bookingDate: dateString(row.bookingDate),
      startTime: row.startTime,
    };
  }
  if (service === "massage_programs") {
    const [row] = await db.select().from(massageProgramBookings)
      .where(eq(massageProgramBookings.id, reservationId)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Reserva de programa no encontrada" });
    const payments = await db.select().from(reservationPayments).where(and(
      eq(reservationPayments.module, "massage_programs"),
      eq(reservationPayments.reservationId, reservationId),
    ));
    const totalClp = (row.duration === 30 ? 35_000 : 45_000) * (row.modality === "double" ? 2 : 1);
    const detailedPaid = payments.filter((payment: any) => payment.status === "paid")
      .reduce((sum: number, payment: any) => sum + payment.amountClp, 0);
    const legacyPaid = payments.length === 0 && row.paymentMethod !== "pending_payment" ? totalClp : 0;
    const amountPaidClp = Math.min(totalClp, detailedPaid + legacyPaid);
    return {
      service,
      reservationId,
      provider: "getnet",
      totalClp,
      amountPaidClp,
      outstandingClp: Math.max(0, totalClp - amountPaidClp),
      status: row.status,
      clientName: row.clientName,
      clientEmail: row.clientEmail,
      clientPhone: row.clientPhone,
      serviceName: `Programa ${row.program.replaceAll("_", " ")}`,
      bookingDate: dateString(row.bookingDate),
      startTime: row.startTime,
    };
  }
  if (service === "biopools") {
    const [row] = await db
      .select({
        id: biopoolBookings.id,
        status: biopoolBookings.status,
        paymentStatus: biopoolBookings.paymentStatus,
        originalAmountClp: biopoolBookings.originalAmountClp,
        discountAmountClp: biopoolBookings.discountAmountClp,
        amountPaidClp: biopoolBookings.amountPaidClp,
        clientName: biopoolBookings.clientName,
        clientEmail: biopoolBookings.clientEmail,
        clientPhone: biopoolBookings.clientPhone,
        bookingDate: biopoolBookings.bookingDate,
        startTime: biopoolBookings.startTime,
        serviceName: biopoolServices.name,
      })
      .from(biopoolBookings)
      .leftJoin(biopoolServices, eq(biopoolBookings.serviceId, biopoolServices.id))
      .where(eq(biopoolBookings.id, reservationId))
      .limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Reserva de Biopiscinas no encontrada" });
    const totalClp = Math.max(0, row.originalAmountClp - row.discountAmountClp);
    const payments = await db.select().from(reservationPayments).where(and(
      eq(reservationPayments.module, "biopools"),
      eq(reservationPayments.reservationId, reservationId),
    ));
    const detailedPaidClp = payments.filter((payment: any) => payment.status === "paid")
      .reduce((sum: number, payment: any) => sum + payment.amountClp, 0);
    const legacyPaidClp = ["paid", "partially_paid", "partially_refunded", "refunded"].includes(row.paymentStatus)
      ? Math.max(0, row.amountPaidClp - detailedPaidClp)
      : 0;
    const amountPaidClp = detailedPaidClp + legacyPaidClp;
    return {
      service,
      reservationId,
      provider: "webpay",
      totalClp,
      amountPaidClp,
      outstandingClp: Math.max(0, totalClp - amountPaidClp),
      status: row.status,
      clientName: row.clientName,
      clientEmail: row.clientEmail,
      clientPhone: row.clientPhone,
      serviceName: row.serviceName ?? "Biopiscinas",
      bookingDate: row.bookingDate,
      startTime: row.startTime,
    };
  }
  const [row] = await db
    .select()
    .from(saunaBookings)
    .where(eq(saunaBookings.id, reservationId))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Reserva de Sauna no encontrada" });
  const totalClp = Math.max(0, row.amountClp);
  const payments = await db.select().from(reservationPayments).where(and(
    eq(reservationPayments.module, "sauna"),
    eq(reservationPayments.reservationId, reservationId),
  ));
  const detailedPaidClp = payments.filter((payment: any) => payment.status === "paid")
    .reduce((sum: number, payment: any) => sum + payment.amountClp, 0);
  const legacyPaidClp = ["paid", "partially_paid", "partially_refunded", "refunded"].includes(row.paymentStatus)
    ? Math.max(0, row.amountPaidClp - detailedPaidClp)
    : 0;
  const amountPaidClp = detailedPaidClp + legacyPaidClp;
  return {
    service,
    reservationId,
    provider: "webpay",
    totalClp,
    amountPaidClp,
    outstandingClp: Math.max(0, totalClp - amountPaidClp),
    status: row.status,
    clientName: row.clientName ?? "Cliente Cancagua",
    clientEmail: row.clientEmail,
    clientPhone: row.clientPhone,
    serviceName: row.serviceName,
    bookingDate: row.bookingDate,
    startTime: row.startTime,
  };
}

async function lockReservations(tx: any, reservations: Array<{ service: PaymentLinkService; reservationId: number }>): Promise<void> {
  const tableFor: Record<PaymentLinkService, string> = {
    massages: "massage_bookings",
    massage_programs: "massage_program_bookings",
    biopools: "biopool_bookings",
    sauna: "sauna_bookings",
  };
  const ordered = [...reservations].sort((a, b) =>
    `${a.service}:${String(a.reservationId).padStart(12, "0")}`.localeCompare(
      `${b.service}:${String(b.reservationId).padStart(12, "0")}`,
    ),
  );
  for (const item of ordered) {
    await tx.execute(sql.raw(`SELECT id FROM ${tableFor[item.service]} WHERE id = ${Number(item.reservationId)} FOR UPDATE`));
    await tx.execute(sql.raw(
      `SELECT id FROM reservation_payments WHERE module = '${item.service}' AND reservation_id = ${Number(item.reservationId)} FOR UPDATE`,
    ));
  }
}

export function assertPaymentLinkPayable(snapshot: BookingSnapshot): void {
  if (["cancelled", "no_show"].includes(snapshot.status)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${snapshot.serviceName}: la reserva está cancelada o marcada como inasistencia` });
  }
  if (snapshot.totalClp <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${snapshot.serviceName}: la reserva no tiene un monto por cobrar` });
  }
  if (snapshot.outstandingClp <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${snapshot.serviceName}: la reserva ya está pagada completamente` });
  }
}

export function paymentLinkExpiry(snapshots: BookingSnapshot[]): Date {
  const now = Date.now();
  let expiresAt = now + REQUEST_LIFETIME_MS;
  for (const item of snapshots) {
    const start = chileLocalDateTimeToUtc(item.bookingDate, item.startTime).getTime();
    if (start <= now) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `${item.serviceName}: no se puede generar un link para una reserva que ya comenzó` });
    }
    expiresAt = Math.min(expiresAt, start);
  }
  return new Date(expiresAt);
}

async function replacePendingPlaceholders(params: {
  tx: any;
  snapshot: BookingSnapshot;
  requestId: number;
  publicToken: string;
  createdByUserId: number;
}): Promise<number> {
  const { tx, snapshot, requestId, publicToken, createdByUserId } = params;
  const rows = await tx.select().from(reservationPayments).where(and(
    eq(reservationPayments.module, snapshot.service),
    eq(reservationPayments.reservationId, snapshot.reservationId),
  ));
  const pending = rows.filter((row: any) => row.status === "pending");
  const blocking = pending.filter((row: any) => !REPLACEABLE_PENDING_METHODS.has(row.method));
  if (blocking.length) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `${snapshot.serviceName}: existe un pago pendiente (${blocking[0].method}) que debes resolver o eliminar antes de generar el link`,
    });
  }
  if (pending.length) {
    await tx.delete(reservationPayments).where(inArray(reservationPayments.id, pending.map((row: any) => row.id)));
  }
  const method = snapshot.provider === "getnet" ? "getnet_link" : "payment_link";
  const [payment] = await tx.insert(reservationPayments).values({
    module: snapshot.service,
    reservationId: snapshot.reservationId,
    method,
    status: "pending",
    amountClp: snapshot.outstandingClp,
    reference: `PAYLINK:${publicToken}`,
    createdByUserId,
  }).$returningId();
  await tx.insert(reservationPaymentAllocations).values({
    requestId,
    service: snapshot.service,
    reservationId: snapshot.reservationId,
    amountClp: snapshot.outstandingClp,
    paymentId: payment.id,
  });
  return payment.id;
}

async function cancelOverlappingRequests(tx: any, snapshots: BookingSnapshot[]): Promise<void> {
  const conditions = snapshots.map(item => and(
    eq(reservationPaymentAllocations.service, item.service),
    eq(reservationPaymentAllocations.reservationId, item.reservationId),
  ));
  if (!conditions.length) return;
  const overlaps = await tx
    .select({
      requestId: reservationPaymentRequests.id,
      status: reservationPaymentRequests.status,
      paymentId: reservationPaymentAllocations.paymentId,
    })
    .from(reservationPaymentAllocations)
    .innerJoin(reservationPaymentRequests, eq(reservationPaymentAllocations.requestId, reservationPaymentRequests.id))
    .where(and(
      inArray(reservationPaymentRequests.status, ["active", "processing", "reconciliation_required"]),
      or(...conditions),
    ));
  const requestIds = [...new Set(overlaps.map((row: any) => row.requestId))] as number[];
  if (!requestIds.length) return;
  for (const requestId of [...requestIds].sort((a, b) => a - b)) {
    await tx.execute(sql`SELECT id FROM reservation_payment_requests WHERE id = ${requestId} FOR UPDATE`);
  }
  const freshRequests = await tx.select({ id: reservationPaymentRequests.id, status: reservationPaymentRequests.status })
    .from(reservationPaymentRequests)
    .where(inArray(reservationPaymentRequests.id, requestIds));
  if (freshRequests.some((row: any) => ["processing", "reconciliation_required"].includes(row.status))) {
    // Nunca liberar por reloj un intento que el proveedor pudo cobrar. La
    // verificación contra Getnet/Webpay se ejecuta antes de entrar a esta tx.
    throw new TRPCError({
      code: "CONFLICT",
      message: freshRequests.some((row: any) => row.status === "reconciliation_required")
        ? "Una de estas reservas tiene un pago electrónico en revisión. No generes otro cobro hasta conciliarlo"
        : "Ya existe un pago iniciado para una de estas reservas. Espera su resultado antes de generar otro link",
    });
  }
  const activeRequestIds = freshRequests.filter((row: any) => row.status === "active").map((row: any) => row.id) as number[];
  if (!activeRequestIds.length) return;
  await tx.update(reservationPaymentRequests).set({ status: "cancelled", cancelledAt: new Date() })
    .where(and(
      inArray(reservationPaymentRequests.id, activeRequestIds),
      eq(reservationPaymentRequests.status, "active"),
    ));
  // Si el link anterior agrupaba más reservas que la selección nueva, también
  // se retiran sus demás placeholders: ninguna reserva debe quedar apuntando a
  // una solicitud ya cancelada.
  const allAllocations = await tx.select().from(reservationPaymentAllocations)
    .where(inArray(reservationPaymentAllocations.requestId, activeRequestIds));
  const paymentIds = allAllocations.map((row: any) => row.paymentId).filter((id: unknown): id is number => typeof id === "number");
  if (paymentIds.length) {
    await tx.delete(reservationPayments).where(and(
      inArray(reservationPayments.id, paymentIds),
      eq(reservationPayments.status, "pending"),
    ));
  }
}

async function loadRequest(db: any, token: string) {
  const [request] = await db.select().from(reservationPaymentRequests)
    .where(eq(reservationPaymentRequests.publicToken, token)).limit(1);
  if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "El link de pago no existe" });
  return request;
}

async function loadAllocations(db: any, requestId: number) {
  return db.select().from(reservationPaymentAllocations)
    .where(eq(reservationPaymentAllocations.requestId, requestId));
}

async function resolveStaleProviderAttempt(db: any, request: typeof reservationPaymentRequests.$inferSelect): Promise<void> {
  if (request.status !== "processing") return;
  const [attempt] = await db.select().from(reservationPaymentAttempts).where(and(
    eq(reservationPaymentAttempts.requestId, request.id),
    inArray(reservationPaymentAttempts.status, ["initiating", "pending"]),
  )).orderBy(desc(reservationPaymentAttempts.id)).limit(1);
  if (!attempt || attempt.expiresAt.getTime() > Date.now()) return;
  try {
    if (attempt.provider === "getnet" && attempt.providerRequestId) {
      const info = await getGetnetSessionInfo(attempt.providerRequestId);
      if (info.status === "APPROVED") {
        await finalizeApprovedAttempt({
          attemptId: attempt.id,
          providerReference: info.reference ?? "",
          amountClp: info.amount,
          currency: info.currency,
          providerStatus: info.status,
          raw: info,
        });
      } else if (["REJECTED", "FAILED"].includes(info.status)) {
        await markAttemptNotApproved(attempt.id, info.status === "REJECTED" ? "rejected" : "failed", info.status, info);
      }
      return;
    }
    if (attempt.provider === "webpay" && attempt.webpayToken) {
      const result = await getTransactionStatus(attempt.webpayToken);
      if (isTransactionApproved(result.responseCode, result.status)) {
        await finalizeApprovedAttempt({
          attemptId: attempt.id,
          providerReference: result.buyOrder,
          amountClp: result.amount,
          currency: "CLP",
          providerStatus: result.status,
          authorizationCode: result.authorizationCode,
          raw: result,
        });
      } else if (["FAILED", "REVERSED", "NULLIFIED"].includes(result.status)) {
        await markAttemptNotApproved(attempt.id, "failed", result.status, result);
      }
    }
    // PENDING o cualquier respuesta ambigua conserva processing y bloquea un
    // segundo cobro. Lo mismo aplica a initiating sin identificador persistido.
  } catch (error) {
    console.error("[payment-link] No se pudo resolver intento vencido; se mantiene bloqueado", attempt.id, error);
  }
}

async function resolveOverlappingProviderAttempts(db: any, snapshots: BookingSnapshot[]): Promise<void> {
  const conditions = snapshots.map(item => and(
    eq(reservationPaymentAllocations.service, item.service),
    eq(reservationPaymentAllocations.reservationId, item.reservationId),
  ));
  if (!conditions.length) return;
  const requests = await db.select({ request: reservationPaymentRequests })
    .from(reservationPaymentAllocations)
    .innerJoin(reservationPaymentRequests, eq(reservationPaymentAllocations.requestId, reservationPaymentRequests.id))
    .where(and(eq(reservationPaymentRequests.status, "processing"), or(...conditions)));
  const unique = new Map<number, typeof reservationPaymentRequests.$inferSelect>();
  for (const row of requests) unique.set(row.request.id, row.request);
  for (const request of unique.values()) await resolveStaleProviderAttempt(db, request);
}

async function assertRequestAmountsCurrent(db: any, request: typeof reservationPaymentRequests.$inferSelect): Promise<BookingSnapshot[]> {
  const allocations = await loadAllocations(db, request.id);
  const snapshots: BookingSnapshot[] = [];
  for (const allocation of allocations) {
    const snapshot = await getBookingSnapshot(db, allocation.service, allocation.reservationId);
    assertPaymentLinkPayable(snapshot);
    const [placeholder] = allocation.paymentId
      ? await db.select().from(reservationPayments).where(eq(reservationPayments.id, allocation.paymentId)).limit(1)
      : [];
    if (
      !placeholder
      || placeholder.status !== "pending"
      || placeholder.amountClp !== allocation.amountClp
      || placeholder.reference !== `PAYLINK:${request.publicToken}`
      || !REPLACEABLE_PENDING_METHODS.has(placeholder.method)
    ) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `${snapshot.serviceName}: el detalle pendiente cambió. Genera un link nuevo`,
      });
    }
    if (snapshot.outstandingClp !== allocation.amountClp) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `${snapshot.serviceName}: el saldo cambió de $${allocation.amountClp.toLocaleString("es-CL")} a $${snapshot.outstandingClp.toLocaleString("es-CL")}. Genera un link nuevo`,
      });
    }
    snapshots.push(snapshot);
  }
  const currentTotal = snapshots.reduce((sum, item) => sum + item.outstandingClp, 0);
  if (!snapshots.length || currentTotal !== request.totalClp) {
    throw new TRPCError({ code: "CONFLICT", message: "El total de la solicitud cambió. Genera un link nuevo" });
  }
  return snapshots;
}

function attemptReference(): string {
  return `RPL-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`.slice(0, 26);
}

async function createAttempt(token: string) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible" });
  const before = await loadRequest(db, token);
  await resolveStaleProviderAttempt(db, before);
  const now = new Date();
  const prepared = await db.transaction(async tx => {
    const request = await loadRequest(tx, token);
    await tx.execute(sql`SELECT id FROM reservation_payment_requests WHERE id = ${request.id} FOR UPDATE`);
    const fresh = await loadRequest(tx, token);
    if (fresh.status === "paid") return { request: fresh, attempt: null, alreadyPaid: true as const };
    if (!["active", "processing"].includes(fresh.status)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Este link de pago ya no está activo" });
    }
    if (fresh.expiresAt.getTime() <= now.getTime()) {
      await tx.update(reservationPaymentRequests).set({ status: "expired" }).where(eq(reservationPaymentRequests.id, fresh.id));
      throw new TRPCError({ code: "BAD_REQUEST", message: "Este link de pago venció. Solicita uno nuevo" });
    }
    const allocations = await loadAllocations(tx, fresh.id);
    await lockReservations(tx, allocations);
    await assertRequestAmountsCurrent(tx, fresh);
    const [existing] = await tx.select().from(reservationPaymentAttempts)
      .where(and(
        eq(reservationPaymentAttempts.requestId, fresh.id),
        inArray(reservationPaymentAttempts.status, ["initiating", "pending"]),
      ))
      .orderBy(desc(reservationPaymentAttempts.id)).limit(1);
    if (existing && existing.expiresAt.getTime() > now.getTime()) {
      if (!existing.providerUrl) {
        throw new TRPCError({ code: "CONFLICT", message: "El pago se está iniciando. Intenta nuevamente en unos segundos" });
      }
      return { request: fresh, attempt: existing, alreadyPaid: false as const };
    }
    if (existing) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "El proveedor aún puede confirmar el intento anterior. Espera su resultado antes de volver a pagar",
      });
    }
    const reference = attemptReference();
    const expiresAt = new Date(Math.min(fresh.expiresAt.getTime(), now.getTime() + ATTEMPT_LIFETIME_MS));
    const [created] = await tx.insert(reservationPaymentAttempts).values({
      requestId: fresh.id,
      provider: fresh.provider,
      status: "initiating",
      reference,
      expectedAmountClp: fresh.totalClp,
      expiresAt,
    }).$returningId();
    await tx.update(reservationPaymentRequests).set({ status: "processing" })
      .where(eq(reservationPaymentRequests.id, fresh.id));
    const [attempt] = await tx.select().from(reservationPaymentAttempts)
      .where(eq(reservationPaymentAttempts.id, created.id)).limit(1);
    return { request: fresh, attempt, alreadyPaid: false as const };
  });
  if (prepared.alreadyPaid) return { alreadyPaid: true as const, provider: prepared.request.provider };
  const { request, attempt } = prepared;
  if (!attempt) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  if (attempt.status === "pending" && attempt.providerUrl) {
    return {
      alreadyPaid: false as const,
      provider: request.provider,
      url: attempt.providerUrl,
      token: attempt.webpayToken,
    };
  }
  let providerSessionCreated = false;
  try {
    if (request.provider === "getnet") {
      const session = await createGetnetSession({
        reference: attempt.reference,
        description: "Pago de reserva Cancagua",
        amountCLP: request.totalClp,
        clientName: request.clientName,
        clientEmail: request.clientEmail ?? undefined,
        clientPhone: request.clientPhone ?? undefined,
        returnUrl: `${publicPaymentUrl(request.publicToken)}?estado=retorno`,
        notificationUrl: `${ENV.appUrl!.replace(/\/$/, "")}/api/webhooks/getnet`,
        expiration: attempt.expiresAt,
      });
      providerSessionCreated = true;
      await db.update(reservationPaymentAttempts).set({
        status: "pending",
        providerRequestId: session.requestId,
        providerUrl: session.processUrl,
      }).where(eq(reservationPaymentAttempts.id, attempt.id));
      return { alreadyPaid: false as const, provider: "getnet" as const, url: session.processUrl, token: null };
    }
    const sessionId = `SID-${attempt.reference}`;
    const payment = await createTransaction(
      attempt.reference,
      sessionId,
      request.totalClp,
      `${ENV.appUrl!.replace(/\/$/, "")}/api/reservation-payment-links/webpay/return`,
    );
    providerSessionCreated = true;
    await db.update(reservationPaymentAttempts).set({
      status: "pending",
      webpayToken: payment.token,
      providerUrl: payment.url,
    }).where(eq(reservationPaymentAttempts.id, attempt.id));
    return { alreadyPaid: false as const, provider: "webpay" as const, url: payment.url, token: payment.token };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (providerSessionCreated) {
      // Estado incierto: el proveedor ya pudo cobrar. Mantener processing evita
      // emitir un segundo intento; el webhook/retorno lo recupera por referencia.
      await db.update(reservationPaymentAttempts).set({ error: `Sesión creada; persistencia pendiente: ${message}`.slice(0, 2000) })
        .where(eq(reservationPaymentAttempts.id, attempt.id)).catch(() => undefined);
      throw new TRPCError({ code: "CONFLICT", message: "El pago fue iniciado y estamos verificando su estado. No generes otro intento" });
    }
    await db.update(reservationPaymentAttempts).set({ status: "failed", error: message.slice(0, 2000), completedAt: new Date() })
      .where(eq(reservationPaymentAttempts.id, attempt.id));
    await db.update(reservationPaymentRequests).set({ status: "active" })
      .where(and(eq(reservationPaymentRequests.id, request.id), eq(reservationPaymentRequests.status, "processing")));
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No pudimos iniciar el pago. Intenta nuevamente" });
  }
}

type ProviderApproval = {
  attemptId: number;
  providerReference: string;
  amountClp: number | undefined;
  currency: string | undefined;
  providerStatus: string;
  authorizationCode?: string;
  raw: unknown;
};

function serializeProviderResponse(value: unknown): string {
  try {
    return JSON.stringify(value ?? null).slice(0, 60_000);
  } catch {
    return JSON.stringify({ error: "La respuesta del proveedor no era serializable" });
  }
}

async function markReconciliation(db: any, approval: ProviderApproval, reason: string): Promise<void> {
  const massageIds: number[] = [];
  await db.transaction(async (tx: any) => {
    let [attempt] = await tx.select().from(reservationPaymentAttempts)
      .where(eq(reservationPaymentAttempts.id, approval.attemptId)).limit(1);
    if (!attempt) return;
    const requestId = attempt.requestId;
    await tx.execute(sql`SELECT id FROM reservation_payment_requests WHERE id = ${requestId} FOR UPDATE`);
    await tx.execute(sql`SELECT id FROM reservation_payment_attempts WHERE id = ${attempt.id} FOR UPDATE`);
    [attempt] = await tx.select().from(reservationPaymentAttempts)
      .where(eq(reservationPaymentAttempts.id, approval.attemptId)).limit(1);
    if (!attempt || ["approved", "reconciliation_required"].includes(attempt.status)) return;
    const [request] = await tx.select().from(reservationPaymentRequests)
      .where(eq(reservationPaymentRequests.id, attempt.requestId)).limit(1);
    if (!request) return;
    const providerApproved = ["APPROVED", "AUTHORIZED"].includes(approval.providerStatus);
    const providerDataComplete = Number.isInteger(approval.amountClp)
      && (approval.amountClp ?? 0) > 0
      && approval.currency === "CLP";
    if (providerApproved && providerDataComplete) {
      const allocations = await loadAllocations(tx, request.id);
      await lockReservations(tx, allocations);
      const receivedTotal = approval.amountClp!;
      let allocatedSoFar = 0;
      for (let index = 0; index < allocations.length; index += 1) {
        const allocation = allocations[index];
        const amountClp = index === allocations.length - 1
          ? Math.max(0, receivedTotal - allocatedSoFar)
          : Math.max(0, Math.floor(receivedTotal * allocation.amountClp / attempt.expectedAmountClp));
        allocatedSoFar += amountClp;
        if (amountClp <= 0) continue;
        const snapshot = await getBookingSnapshot(tx, allocation.service, allocation.reservationId);
        const method = request.provider === "getnet" ? "getnet" : "webpay_plus";
        const paymentReference = approval.authorizationCode
          || (request.provider === "getnet" ? attempt.providerRequestId : attempt.reference)
          || attempt.reference;
        const [linkedPayment] = allocation.paymentId
          ? await tx.select().from(reservationPayments).where(eq(reservationPayments.id, allocation.paymentId)).limit(1)
          : [];
        let alreadyRecorded = false;
        if (linkedPayment?.status === "paid" && linkedPayment.method === method && linkedPayment.reference === paymentReference) {
          alreadyRecorded = true;
        } else if (linkedPayment?.status === "pending") {
          await tx.update(reservationPayments).set({
            method,
            status: "paid",
            amountClp,
            paidAt: new Date(),
            reference: paymentReference,
            cardType: null,
          }).where(eq(reservationPayments.id, linkedPayment.id));
        } else {
          const [insertedPayment] = await tx.insert(reservationPayments).values({
            module: allocation.service,
            reservationId: allocation.reservationId,
            method,
            status: "paid",
            amountClp,
            paidAt: new Date(),
            reference: paymentReference,
            createdByUserId: request.createdByUserId,
          }).$returningId();
          await tx.update(reservationPaymentAllocations).set({ paymentId: insertedPayment.id })
            .where(eq(reservationPaymentAllocations.id, allocation.id));
        }
        if (alreadyRecorded) continue;
        const newPaid = snapshot.amountPaidClp + amountClp;
        const auditNote = `RECONCILIACIÓN REQUERIDA: pago ${request.provider} por $${amountClp.toLocaleString("es-CL")} registrado (${paymentReference}). ${reason}`;
        if (allocation.service === "massages") {
          await tx.update(massageBookings).set({
            amountPaid: String(newPaid),
            paymentStatus: calculatedPaymentStatus(newPaid, snapshot.totalClp),
            getnetRequestId: attempt.providerRequestId,
            manualPaymentMethod: null,
            notes: sql`CONCAT_WS('\n', NULLIF(${massageBookings.notes}, ''), ${auditNote})`,
          }).where(eq(massageBookings.id, allocation.reservationId));
          massageIds.push(allocation.reservationId);
        } else if (allocation.service === "massage_programs") {
          await tx.update(massageProgramBookings).set({
            paymentMethod: "getnet_link",
            paymentReference,
            notes: sql`CONCAT_WS('\n', NULLIF(${massageProgramBookings.notes}, ''), ${auditNote})`,
          }).where(eq(massageProgramBookings.id, allocation.reservationId));
        } else if (allocation.service === "biopools") {
          await tx.update(biopoolBookings).set({
            amountPaidClp: newPaid,
            paymentStatus: calculatedPaymentStatus(newPaid, snapshot.totalClp),
            paymentMethod: snapshot.amountPaidClp > 0 ? "mixed" : "webpay_plus",
            paymentReference: snapshot.amountPaidClp > 0 ? null : paymentReference,
          }).where(eq(biopoolBookings.id, allocation.reservationId));
          await tx.insert(biopoolBookingActivity).values({
            bookingId: allocation.reservationId,
            action: "payment_reconciliation_required",
            detail: JSON.stringify({ provider: request.provider, amountClp, reference: paymentReference, reason }),
            userId: null,
          });
        } else {
          await tx.update(saunaBookings).set({
            amountPaidClp: newPaid,
            paymentStatus: calculatedPaymentStatus(newPaid, snapshot.totalClp),
            paymentMethod: snapshot.amountPaidClp > 0 ? "mixed" : "webpay_plus",
            paymentReference: snapshot.amountPaidClp > 0 ? null : paymentReference,
            notes: sql`CONCAT_WS('\n', NULLIF(${saunaBookings.notes}, ''), ${auditNote})`,
          }).where(eq(saunaBookings.id, allocation.reservationId));
        }
      }
    } else if (providerApproved) {
      const allocations = await loadAllocations(tx, request.id);
      await lockReservations(tx, allocations);
      const auditNote = `RECONCILIACIÓN REQUERIDA: ${reason}. El proveedor aprobó el cobro, pero no entregó monto y moneda CLP verificables; no se acreditó automáticamente.`;
      for (const allocation of allocations) {
        if (allocation.service === "massages") {
          await tx.update(massageBookings).set({
            notes: sql`CONCAT_WS('\n', NULLIF(${massageBookings.notes}, ''), ${auditNote})`,
          }).where(eq(massageBookings.id, allocation.reservationId));
        } else if (allocation.service === "massage_programs") {
          await tx.update(massageProgramBookings).set({
            notes: sql`CONCAT_WS('\n', NULLIF(${massageProgramBookings.notes}, ''), ${auditNote})`,
          }).where(eq(massageProgramBookings.id, allocation.reservationId));
        } else if (allocation.service === "biopools") {
          await tx.insert(biopoolBookingActivity).values({
            bookingId: allocation.reservationId,
            action: "payment_reconciliation_required",
            detail: JSON.stringify({ provider: request.provider, reference: approval.providerReference, reason }),
            userId: null,
          });
        } else {
          await tx.update(saunaBookings).set({
            notes: sql`CONCAT_WS('\n', NULLIF(${saunaBookings.notes}, ''), ${auditNote})`,
          }).where(eq(saunaBookings.id, allocation.reservationId));
        }
      }
    }
    await tx.update(reservationPaymentAttempts).set({
      status: "reconciliation_required",
      reportedAmountClp: approval.amountClp ?? null,
      reportedCurrency: approval.currency ?? null,
      providerStatus: approval.providerStatus,
      authorizationCode: approval.authorizationCode ?? null,
      rawResponse: serializeProviderResponse(approval.raw),
      error: reason.slice(0, 2000),
      completedAt: new Date(),
    }).where(eq(reservationPaymentAttempts.id, attempt.id));
    await tx.update(reservationPaymentRequests).set({
      status: "reconciliation_required",
      reconciliationReason: reason.slice(0, 2000),
    }).where(eq(reservationPaymentRequests.id, attempt.requestId));
  });
  for (const bookingId of [...new Set(massageIds)]) {
    await syncMassageSale(bookingId).catch(error => console.error("[payment-link] No se pudo sincronizar venta en conciliación", bookingId, error));
    await startTherapistAssignmentForBooking("massage", bookingId).catch(error => console.error("[payment-link] No se pudo iniciar asignación en conciliación", bookingId, error));
  }
}

async function finalizeApprovedAttempt(approval: ProviderApproval): Promise<{ status: "paid" | "reconciliation_required"; token: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB no disponible");
  const [attempt] = await db.select().from(reservationPaymentAttempts)
    .where(eq(reservationPaymentAttempts.id, approval.attemptId)).limit(1);
  if (!attempt) throw new Error("Intento de pago no encontrado");
  const request = await (async () => {
    const [row] = await db.select().from(reservationPaymentRequests)
      .where(eq(reservationPaymentRequests.id, attempt.requestId)).limit(1);
    return row;
  })();
  if (!request) throw new Error("Solicitud de pago no encontrada");
  if (request.status === "paid" && attempt.status === "approved") {
    return { status: "paid", token: request.publicToken };
  }
  const approvalError = validatePaymentLinkApproval({
    amountClp: approval.amountClp,
    currency: approval.currency,
    providerReference: approval.providerReference,
    expectedAmountClp: attempt.expectedAmountClp,
    expectedReference: attempt.reference,
  });
  if (approvalError) {
    const reason = `${approvalError} (esperado ${attempt.expectedAmountClp} CLP, referencia ${attempt.reference})`;
    await markReconciliation(db, approval, reason);
    return { status: "reconciliation_required", token: request.publicToken };
  }
  if (!["active", "processing"].includes(request.status)) {
    await markReconciliation(db, approval, `El pago fue aprobado cuando el link estaba ${request.status}`);
    return { status: "reconciliation_required", token: request.publicToken };
  }

  const massageIds: number[] = [];
  try {
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT id FROM reservation_payment_requests WHERE id = ${request.id} FOR UPDATE`);
      const [freshRequest] = await tx.select().from(reservationPaymentRequests)
        .where(eq(reservationPaymentRequests.id, request.id)).limit(1);
      const [freshAttempt] = await tx.select().from(reservationPaymentAttempts)
        .where(eq(reservationPaymentAttempts.id, attempt.id)).limit(1);
      if (freshRequest?.status === "paid" && freshAttempt?.status === "approved") return;
      if (!freshRequest || !freshAttempt || !["active", "processing"].includes(freshRequest.status)) {
        throw new Error("El link dejó de estar activo antes de acreditar el pago");
      }
      const allocations = await loadAllocations(tx, freshRequest.id);
      await lockReservations(tx, allocations);
      for (const allocation of allocations) {
        const snapshot = await getBookingSnapshot(tx, allocation.service, allocation.reservationId);
        assertPaymentLinkPayable(snapshot);
        if (snapshot.outstandingClp !== allocation.amountClp) {
          throw new Error(`${snapshot.serviceName}: saldo actual ${snapshot.outstandingClp}, cobro asignado ${allocation.amountClp}`);
        }
        const [payment] = allocation.paymentId
          ? await tx.select().from(reservationPayments).where(eq(reservationPayments.id, allocation.paymentId)).limit(1)
          : [];
        if (!payment || payment.status !== "pending" || payment.reference !== `PAYLINK:${freshRequest.publicToken}`) {
          throw new Error(`${snapshot.serviceName}: el pago pendiente vinculado fue modificado o eliminado`);
        }
      }
      const paidAt = new Date();
      for (const allocation of allocations) {
        const snapshot = await getBookingSnapshot(tx, allocation.service, allocation.reservationId);
        const method = freshRequest.provider === "getnet" ? "getnet" : "webpay_plus";
        const paymentReference = approval.authorizationCode || (freshRequest.provider === "getnet" ? attempt.providerRequestId : attempt.reference) || attempt.reference;
        await tx.update(reservationPayments).set({
          method,
          status: "paid",
          paidAt,
          reference: paymentReference,
          cardType: null,
        }).where(eq(reservationPayments.id, allocation.paymentId!));
        const newPaid = snapshot.amountPaidClp + allocation.amountClp;
        if (allocation.service === "massages") {
          await tx.update(massageBookings).set({
            amountPaid: String(newPaid),
            paymentStatus: calculatedPaymentStatus(newPaid, snapshot.totalClp),
            getnetRequestId: attempt.providerRequestId,
            manualPaymentMethod: null,
            notes: sql`CONCAT_WS('\n', NULLIF(${massageBookings.notes}, ''), ${`Pago Getnet acreditado automáticamente (${paymentReference}).`})`,
          }).where(eq(massageBookings.id, allocation.reservationId));
          massageIds.push(allocation.reservationId);
        } else if (allocation.service === "massage_programs") {
          await tx.update(massageProgramBookings).set({
            paymentMethod: "getnet_link",
            paymentReference,
            notes: sql`CONCAT_WS('\n', NULLIF(${massageProgramBookings.notes}, ''), ${`Pago Getnet acreditado automáticamente (${paymentReference}).`})`,
          }).where(eq(massageProgramBookings.id, allocation.reservationId));
        } else if (allocation.service === "biopools") {
          await tx.update(biopoolBookings).set({
            amountPaidClp: newPaid,
            paymentStatus: calculatedPaymentStatus(newPaid, snapshot.totalClp),
            paymentMethod: snapshot.amountPaidClp > 0 ? "mixed" : "webpay_plus",
            paymentReference: snapshot.amountPaidClp > 0 ? null : paymentReference,
          }).where(eq(biopoolBookings.id, allocation.reservationId));
          await tx.insert(biopoolBookingActivity).values({
            bookingId: allocation.reservationId,
            action: "payment_link_paid",
            detail: JSON.stringify({ provider: "webpay", amountClp: allocation.amountClp, reference: paymentReference }),
            userId: null,
          });
        } else {
          await tx.update(saunaBookings).set({
            amountPaidClp: newPaid,
            paymentStatus: calculatedPaymentStatus(newPaid, snapshot.totalClp),
            paymentMethod: snapshot.amountPaidClp > 0 ? "mixed" : "webpay_plus",
            paymentReference: snapshot.amountPaidClp > 0 ? null : paymentReference,
            notes: sql`CONCAT_WS('\n', NULLIF(${saunaBookings.notes}, ''), ${`Pago Webpay acreditado automáticamente (${paymentReference}).`})`,
          }).where(eq(saunaBookings.id, allocation.reservationId));
        }
      }
      await tx.update(reservationPaymentAttempts).set({
        status: "approved",
        reportedAmountClp: approval.amountClp!,
        reportedCurrency: approval.currency ?? "CLP",
        providerStatus: approval.providerStatus,
        authorizationCode: approval.authorizationCode ?? null,
        rawResponse: serializeProviderResponse(approval.raw),
        completedAt: new Date(),
      }).where(eq(reservationPaymentAttempts.id, attempt.id));
      await tx.update(reservationPaymentRequests).set({
        status: "paid",
        paidAt: new Date(),
        reconciliationReason: null,
      }).where(eq(reservationPaymentRequests.id, request.id));
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await markReconciliation(db, approval, reason);
    return { status: "reconciliation_required", token: request.publicToken };
  }
  for (const bookingId of [...new Set(massageIds)]) {
    await syncMassageSale(bookingId).catch(error => console.error("[payment-link] No se pudo sincronizar venta", bookingId, error));
    await startTherapistAssignmentForBooking("massage", bookingId).catch(error => console.error("[payment-link] No se pudo iniciar asignación", bookingId, error));
  }
  return { status: "paid", token: request.publicToken };
}

async function markAttemptNotApproved(attemptId: number, status: "rejected" | "aborted" | "failed", providerStatus: string, raw: unknown) {
  const db = await getDb();
  if (!db) return;
  await db.transaction(async tx => {
    let [attempt] = await tx.select().from(reservationPaymentAttempts)
      .where(eq(reservationPaymentAttempts.id, attemptId)).limit(1);
    if (!attempt) return;
    await tx.execute(sql`SELECT id FROM reservation_payment_requests WHERE id = ${attempt.requestId} FOR UPDATE`);
    await tx.execute(sql`SELECT id FROM reservation_payment_attempts WHERE id = ${attempt.id} FOR UPDATE`);
    [attempt] = await tx.select().from(reservationPaymentAttempts)
      .where(eq(reservationPaymentAttempts.id, attemptId)).limit(1);
    if (!attempt || ["approved", "reconciliation_required"].includes(attempt.status)) return;
    await tx.update(reservationPaymentAttempts).set({
      status,
      providerStatus,
      rawResponse: serializeProviderResponse(raw),
      completedAt: new Date(),
    }).where(eq(reservationPaymentAttempts.id, attempt.id));
    const [request] = await tx.select().from(reservationPaymentRequests)
      .where(eq(reservationPaymentRequests.id, attempt.requestId)).limit(1);
    if (request && request.status === "processing") {
      await tx.update(reservationPaymentRequests).set({
        status: request.expiresAt.getTime() <= Date.now() ? "expired" : "active",
      }).where(and(
        eq(reservationPaymentRequests.id, request.id),
        eq(reservationPaymentRequests.status, "processing"),
      ));
    }
  });
}

export type GenericGetnetWebhookBody = {
  requestId?: string;
  signature?: string;
  status?: { status?: string; reason?: string; message?: string; date?: string; signature?: string };
  payment?: Array<{ reference?: string; amount?: { total?: number; currency?: string }; status?: { status?: string; signature?: string } }>;
};

export async function handleReservationPaymentLinkGetnetWebhook(body: GenericGetnetWebhookBody): Promise<{ handled: boolean; retry?: boolean }> {
  if (!body.requestId) return { handled: false };
  const db = await getDb();
  if (!db) return { handled: true, retry: true };
  let [attempt] = await db.select().from(reservationPaymentAttempts)
    .where(eq(reservationPaymentAttempts.providerRequestId, body.requestId)).limit(1);
  let verifiedInfo: Awaited<ReturnType<typeof getGetnetSessionInfo>> | undefined;
  if (!attempt) {
    // La sesión pudo quedar creada en Getnet justo antes de una caída al guardar
    // providerRequestId. Su referencia permite recuperar el intento sin dejar
    // un cobro huérfano ni entregarlo al webhook legado.
    try {
      verifiedInfo = await getGetnetSessionInfo(body.requestId);
      if (verifiedInfo.reference) {
        [attempt] = await db.select().from(reservationPaymentAttempts).where(and(
          eq(reservationPaymentAttempts.reference, verifiedInfo.reference),
          eq(reservationPaymentAttempts.provider, "getnet"),
          eq(reservationPaymentAttempts.status, "initiating"),
        )).limit(1);
        if (attempt) {
          await db.update(reservationPaymentAttempts).set({
            providerRequestId: body.requestId,
            status: "pending",
          }).where(and(
            eq(reservationPaymentAttempts.id, attempt.id),
            eq(reservationPaymentAttempts.status, "initiating"),
          ));
          attempt = { ...attempt, providerRequestId: body.requestId, status: "pending" };
        }
      }
    } catch {
      // Si no corresponde al checkout genérico, continúa el flujo Getnet legado.
    }
  }
  if (!attempt) return { handled: false };
  if (["approved", "reconciliation_required"].includes(attempt.status)) return { handled: true };
  const payloadStatus = body.status?.status ?? "";
  const date = body.status?.date ?? "";
  const signature = body.signature ?? body.status?.signature ?? body.payment?.[0]?.status?.signature ?? "";
  const signatureValid = Boolean(signature && payloadStatus && date)
    && validateGetnetWebhookSignature(body.requestId, payloadStatus, date, signature);
  let info;
  try {
    // El monto y la referencia no forman parte de la firma de estado de
    // PlacetoPay. Se verifican siempre contra su API, incluso con firma válida.
    info = verifiedInfo ?? await getGetnetSessionInfo(body.requestId);
  } catch (error) {
    console.error("[payment-link:getnet] No se pudo verificar el intento", body.requestId, error);
    return { handled: true, retry: true };
  }
  if (info.requestId !== body.requestId) {
    await markReconciliation(db, {
      attemptId: attempt.id,
      providerReference: info.reference ?? "",
      amountClp: info.amount,
      currency: info.currency,
      providerStatus: info.status,
      raw: { signatureValid, body, info },
    }, "Getnet respondió con un requestId diferente");
    return { handled: true };
  }
  if (info.status === "APPROVED") {
    await finalizeApprovedAttempt({
      attemptId: attempt.id,
      providerReference: info.reference ?? "",
      amountClp: info.amount,
      currency: info.currency,
      providerStatus: info.status,
      raw: { signatureValid, body, info },
    });
  } else if (["REJECTED", "FAILED"].includes(info.status)) {
    await markAttemptNotApproved(attempt.id, info.status === "REJECTED" ? "rejected" : "failed", info.status, { signatureValid, body, info });
  }
  return { handled: true };
}

export async function handleReservationPaymentLinkWebpayReturn(params: {
  tokenWs?: string;
  tbkToken?: string;
  buyOrder?: string;
  sessionId?: string;
}): Promise<{ publicToken: string | null; status: "paid" | "rejected" | "aborted" | "error" | "reconciliation_required" }> {
  const db = await getDb();
  if (!db) return { publicToken: null, status: "error" };
  let attempt: typeof reservationPaymentAttempts.$inferSelect | undefined;
  let committedResult: Awaited<ReturnType<typeof commitTransaction>> | undefined;
  if (params.tokenWs) {
    [attempt] = await db.select().from(reservationPaymentAttempts)
      .where(eq(reservationPaymentAttempts.webpayToken, params.tokenWs)).limit(1);
  } else if (params.buyOrder) {
    [attempt] = await db.select().from(reservationPaymentAttempts)
      .where(eq(reservationPaymentAttempts.reference, params.buyOrder)).limit(1);
  }
  if (!attempt && params.tokenWs) {
    // Recupera una transacción creada por Webpay cuando el proceso cayó antes
    // de persistir su token. El buy_order firmado por Webpay identifica el
    // intento initiating original.
    try {
      committedResult = await commitTransaction(params.tokenWs);
      [attempt] = await db.select().from(reservationPaymentAttempts).where(and(
        eq(reservationPaymentAttempts.reference, committedResult.buyOrder),
        eq(reservationPaymentAttempts.provider, "webpay"),
        eq(reservationPaymentAttempts.status, "initiating"),
      )).limit(1);
      if (attempt) {
        await db.update(reservationPaymentAttempts).set({
          webpayToken: params.tokenWs,
          status: "pending",
        }).where(and(
          eq(reservationPaymentAttempts.id, attempt.id),
          eq(reservationPaymentAttempts.status, "initiating"),
        ));
        attempt = { ...attempt, webpayToken: params.tokenWs, status: "pending" };
      }
    } catch {
      return { publicToken: null, status: "error" };
    }
  }
  if (!attempt || attempt.provider !== "webpay") return { publicToken: null, status: "error" };
  const [request] = await db.select().from(reservationPaymentRequests)
    .where(eq(reservationPaymentRequests.id, attempt.requestId)).limit(1);
  if (!request) return { publicToken: null, status: "error" };
  if (attempt.status === "approved" && request.status === "paid") return { publicToken: request.publicToken, status: "paid" };
  if (attempt.status === "reconciliation_required") return { publicToken: request.publicToken, status: "reconciliation_required" };
  if (!params.tokenWs) {
    if (
      !params.tbkToken
      || !attempt.webpayToken
      || params.tbkToken !== attempt.webpayToken
      || (params.sessionId && params.sessionId !== `SID-${attempt.reference}`)
    ) {
      return { publicToken: request.publicToken, status: "error" };
    }
    await markAttemptNotApproved(attempt.id, "aborted", "ABORTED", params);
    return { publicToken: request.publicToken, status: "aborted" };
  }
  try {
    const result = committedResult ?? await commitTransaction(params.tokenWs);
    const approved = isTransactionApproved(result.responseCode, result.status);
    if (!approved) {
      await markAttemptNotApproved(attempt.id, "rejected", result.status, result);
      return { publicToken: request.publicToken, status: "rejected" };
    }
    if (result.sessionId !== `SID-${attempt.reference}`) {
      await markReconciliation(db, {
        attemptId: attempt.id,
        providerReference: result.buyOrder,
        amountClp: result.amount,
        currency: "CLP",
        providerStatus: result.status,
        authorizationCode: result.authorizationCode,
        raw: result,
      }, "Webpay informó un identificador de sesión diferente");
      return { publicToken: request.publicToken, status: "reconciliation_required" };
    }
    const finalized = await finalizeApprovedAttempt({
      attemptId: attempt.id,
      providerReference: result.buyOrder,
      amountClp: result.amount,
      currency: "CLP",
      providerStatus: result.status,
      authorizationCode: result.authorizationCode,
      raw: result,
    });
    return { publicToken: finalized.token, status: finalized.status };
  } catch (error) {
    try {
      const status = await getTransactionStatus(params.tokenWs);
      if (isTransactionApproved(status.responseCode, status.status)) {
        const finalized = await finalizeApprovedAttempt({
          attemptId: attempt.id,
          providerReference: status.buyOrder,
          amountClp: status.amount,
          currency: "CLP",
          providerStatus: status.status,
          authorizationCode: status.authorizationCode,
          raw: status,
        });
        return { publicToken: finalized.token, status: finalized.status };
      }
      if (["FAILED", "REVERSED", "NULLIFIED"].includes(status.status)) {
        await markAttemptNotApproved(attempt.id, "failed", status.status, status);
      }
      // Un estado ambiguo queda processing/pending: nunca se permite crear un
      // segundo intento mientras el primero pueda terminar cobrado.
    } catch (statusError) {
      await db.update(reservationPaymentAttempts).set({
        error: `Resultado incierto tras retorno Webpay: ${statusError instanceof Error ? statusError.message : String(statusError)}`.slice(0, 2000),
      }).where(eq(reservationPaymentAttempts.id, attempt.id));
    }
    return { publicToken: request.publicToken, status: "error" };
  }
}

export const reservationPaymentLinksRouter = router({
  create: protectedProcedure
    .input(z.object({
      reservations: z.array(z.object({ service: paymentLinkServiceSchema, reservationId: z.number().int().positive() })).min(1).max(20),
    }).superRefine(({ reservations }, ctx) => {
      const keys = reservations.map(item => `${item.service}:${item.reservationId}`);
      if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", message: "Una reserva está repetida" });
    }))
    .mutation(async ({ ctx, input }) => {
      for (const item of input.reservations) assertCreatePermission(ctx.user, item.service);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible" });
      const snapshots: BookingSnapshot[] = [];
      for (const item of input.reservations) {
        const snapshot = await getBookingSnapshot(db, item.service, item.reservationId);
        assertPaymentLinkPayable(snapshot);
        snapshots.push(snapshot);
      }
      await resolveOverlappingProviderAttempts(db, snapshots);
      if (snapshots.some(item => !samePaymentLinkClient(snapshots[0], item))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Solo se pueden generar links para reservas del mismo cliente" });
      }
      const groups = new Map<PaymentProvider, BookingSnapshot[]>();
      for (const snapshot of snapshots) groups.set(snapshot.provider, [...(groups.get(snapshot.provider) ?? []), snapshot]);
      for (const group of groups.values()) {
        if (group.some(item => !samePaymentLinkClient(group[0], item))) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Solo se pueden agrupar reservas del mismo cliente en un link" });
        }
      }
      return db.transaction(async tx => {
        await lockReservationPaymentScopes(tx, snapshots);
        await cancelOverlappingRequests(tx, snapshots);
        await lockReservations(tx, snapshots);
        const currentSnapshots: BookingSnapshot[] = [];
        for (const item of snapshots) {
          const current = await getBookingSnapshot(tx, item.service, item.reservationId);
          assertPaymentLinkPayable(current);
          currentSnapshots.push(current);
        }
        if (currentSnapshots.some(item => !samePaymentLinkClient(currentSnapshots[0], item))) {
          throw new TRPCError({ code: "CONFLICT", message: "Los datos del cliente cambiaron. Vuelve a seleccionar las reservas" });
        }
        const currentGroups = new Map<PaymentProvider, BookingSnapshot[]>();
        for (const snapshot of currentSnapshots) currentGroups.set(snapshot.provider, [...(currentGroups.get(snapshot.provider) ?? []), snapshot]);
        const links: Array<{ token: string; provider: PaymentProvider; totalClp: number; url: string; reservationCount: number; expiresAt: Date }> = [];
        for (const [provider, group] of currentGroups) {
          const token = randomBytes(24).toString("hex");
          const totalClp = group.reduce((sum, item) => sum + item.outstandingClp, 0);
          const expiresAt = paymentLinkExpiry(group);
          const [created] = await tx.insert(reservationPaymentRequests).values({
            publicToken: token,
            provider,
            status: "active",
            totalClp,
            clientName: group[0].clientName,
            clientEmail: group[0].clientEmail,
            clientPhone: group[0].clientPhone,
            expiresAt,
            createdByUserId: ctx.user.id,
          }).$returningId();
          for (const snapshot of group) {
            await replacePendingPlaceholders({ tx, snapshot, requestId: created.id, publicToken: token, createdByUserId: ctx.user.id });
          }
          links.push({ token, provider, totalClp, url: publicPaymentUrl(token), reservationCount: group.length, expiresAt });
        }
        return { links, clientPhone: currentSnapshots[0]?.clientPhone ?? null };
      });
    }),

  get: publicProcedure
    .input(z.object({ token: z.string().length(48) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      let request = await loadRequest(db, input.token);
      await resolveStaleProviderAttempt(db, request);
      request = await loadRequest(db, input.token);
      if (request.status === "active" && request.expiresAt.getTime() <= Date.now()) {
        await db.update(reservationPaymentRequests).set({ status: "expired" }).where(and(
          eq(reservationPaymentRequests.id, request.id),
          eq(reservationPaymentRequests.status, "active"),
        ));
        request = await loadRequest(db, input.token);
      }
      const allocations = await loadAllocations(db, request.id);
      const [latestAttempt] = await db.select().from(reservationPaymentAttempts)
        .where(eq(reservationPaymentAttempts.requestId, request.id))
        .orderBy(desc(reservationPaymentAttempts.id)).limit(1);
      const status = request.status === "active" && latestAttempt
        && ["rejected", "aborted", "failed"].includes(latestAttempt.status)
        ? "rejected" as const
        : request.status;
      const items = [];
      for (const allocation of allocations) {
        const snapshot = await getBookingSnapshot(db, allocation.service, allocation.reservationId);
        items.push({
          service: allocation.service,
          reservationId: allocation.reservationId,
          serviceName: snapshot.serviceName,
          bookingDate: snapshot.bookingDate,
          startTime: snapshot.startTime,
          amountClp: allocation.amountClp,
        });
      }
      return {
        token: request.publicToken,
        provider: request.provider,
        status,
        totalClp: request.totalClp,
        client: {
          name: request.clientName,
        },
        expiresAt: request.expiresAt,
        paidAt: request.paidAt,
        items,
        canPay: request.status === "active" && request.expiresAt.getTime() > Date.now(),
      };
    }),

  start: publicProcedure
    .input(z.object({ token: z.string().length(48) }))
    .mutation(async ({ input }) => {
      const result = await createAttempt(input.token);
      return result.alreadyPaid
        ? { provider: result.provider, paymentUrl: null, tokenWs: null, status: "paid" as const }
        : {
            provider: result.provider,
            paymentUrl: result.url,
            tokenWs: result.provider === "webpay" ? result.token : null,
            status: "pending" as const,
          };
    }),

  activeForReservation: protectedProcedure
    .input(z.object({ service: paymentLinkServiceSchema, reservationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      assertCreatePermission(ctx.user, input.service);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      let [request] = await db.select({ request: reservationPaymentRequests })
        .from(reservationPaymentAllocations)
        .innerJoin(reservationPaymentRequests, eq(reservationPaymentAllocations.requestId, reservationPaymentRequests.id))
        .where(and(
          eq(reservationPaymentAllocations.service, input.service),
          eq(reservationPaymentAllocations.reservationId, input.reservationId),
          inArray(reservationPaymentRequests.status, ["active", "processing", "reconciliation_required"]),
        )).orderBy(desc(reservationPaymentRequests.id)).limit(1);
      if (request?.request.status === "processing") {
        await resolveStaleProviderAttempt(db, request.request);
        [request] = await db.select({ request: reservationPaymentRequests })
          .from(reservationPaymentAllocations)
          .innerJoin(reservationPaymentRequests, eq(reservationPaymentAllocations.requestId, reservationPaymentRequests.id))
          .where(and(
            eq(reservationPaymentAllocations.service, input.service),
            eq(reservationPaymentAllocations.reservationId, input.reservationId),
            inArray(reservationPaymentRequests.status, ["active", "processing", "reconciliation_required"]),
          )).orderBy(desc(reservationPaymentRequests.id)).limit(1);
      }
      if (request?.request.status === "active" && request.request.expiresAt.getTime() <= Date.now()) {
        await db.update(reservationPaymentRequests).set({ status: "expired" }).where(and(
          eq(reservationPaymentRequests.id, request.request.id),
          eq(reservationPaymentRequests.status, "active"),
        ));
        return null;
      }
      const reservationCount = request
        ? (await loadAllocations(db, request.request.id)).length
        : 0;
      return request ? {
        token: request.request.publicToken,
        provider: request.request.provider,
        status: request.request.status,
        totalClp: request.request.totalClp,
        url: publicPaymentUrl(request.request.publicToken),
        expiresAt: request.request.expiresAt,
        reservationCount,
      } : null;
    }),

  cancel: protectedProcedure
    .input(z.object({ token: z.string().length(48) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const request = await loadRequest(db, input.token);
      const allocations = await loadAllocations(db, request.id);
      for (const allocation of allocations) assertCreatePermission(ctx.user, allocation.service);
      if (!["active", "processing"].includes(request.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este link ya no se puede cancelar" });
      }
      if (request.status === "processing") {
        throw new TRPCError({ code: "CONFLICT", message: "El pago ya fue iniciado y no puede cancelarse hasta recibir su resultado" });
      }
      await db.transaction(async tx => {
        await tx.execute(sql`SELECT id FROM reservation_payment_requests WHERE id = ${request.id} FOR UPDATE`);
        const [fresh] = await tx.select().from(reservationPaymentRequests)
          .where(eq(reservationPaymentRequests.id, request.id)).limit(1);
        if (!fresh || fresh.status !== "active") {
          throw new TRPCError({
            code: "CONFLICT",
            message: fresh?.status === "processing"
              ? "El pago ya fue iniciado y no puede cancelarse hasta recibir su resultado"
              : "Este link ya no se puede cancelar",
          });
        }
        await tx.update(reservationPaymentRequests).set({ status: "cancelled", cancelledAt: new Date() })
          .where(and(
            eq(reservationPaymentRequests.id, request.id),
            eq(reservationPaymentRequests.status, "active"),
          ));
        const paymentIds = allocations.map((item: any) => item.paymentId).filter((id: unknown): id is number => typeof id === "number");
        if (paymentIds.length) await tx.delete(reservationPayments).where(and(
          inArray(reservationPayments.id, paymentIds),
          eq(reservationPayments.status, "pending"),
        ));
      });
      return { success: true };
    }),
});
