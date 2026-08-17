import { TRPCError } from "@trpc/server";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import {
  biopoolBookings,
  biopoolBookingActivity,
  biopoolCheckoutOrders,
  biopoolNotifications,
  biopoolServices,
  biopoolTicketTypes,
  client360Audit,
  client360ExternalEvents,
  client360Identities,
  client360Profiles,
  client360ReservationLinks,
  clients as skeduClients,
  giftCards,
  giftCardTransactions,
  massageBookings,
  massageNpsResponses,
  massageProgramBookings,
  massageTechniques,
  massageTherapists,
  massageRooms,
  regularClassAttendances,
  regularClassDisciplines,
  regularClassMemberships,
  regularClassPlans,
  regularClassSchedules,
  regularClassSessions,
  regularClassStudents,
  regularClassTeachers,
  reservationPayments,
  saunaBookings,
  saunaCheckoutOrders,
  saunaProgramQueue,
} from "../drizzle/schema";
import {
  hasCmsPermission,
  hasMassagePaymentAccess,
  isAdminRole,
  type PermissionUser,
} from "../shared/permissions";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { redeemGiftCardPayment } from "./reservationPayments";
import { assertNoLiveReservationPaymentAttempt } from "./reservationPaymentLinkGuards";
import { parseRescheduleAuditLines } from "./rescheduleAudit";
import { syncMassageSale } from "./massageSales";
import { getAllSkeduAppointments, getAllSkeduBusinessUsers } from "./skedu";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const serviceSchema = z.enum(["massages", "biopools", "sauna", "regular_classes"]);
const calendarServiceSchema = z.enum([
  "massages",
  "biopools",
  "sauna",
  "regular_classes",
]);

type ServiceKey = z.infer<typeof serviceSchema>;
type CalendarServiceKey = z.infer<typeof calendarServiceSchema>;
const eventKindSchema = z.enum([
  "massage",
  "massage_program",
  "biopool",
  "sauna",
  "regular_class",
  "regular_class_schedule",
  "regular_class_membership",
]);
const clientReservationKindSchema = z.enum([
  "massage",
  "massage_program",
  "biopool",
  "sauna",
  "regular_class",
  "regular_class_membership",
]);
type ClientReservationKind = z.infer<typeof clientReservationKindSchema>;
const clientReservationReferenceSchema = z.union([
  z.object({
    kind: clientReservationKindSchema,
    entityId: z.number().int().positive(),
  }),
  // Forma exacta entregada por UnifiedBookingDialog al crear reservas.
  z.object({
    service: z.enum(["massages", "massage_programs", "biopools", "sauna", "regular_classes"]),
    reservationId: z.number().int().positive(),
  }),
]);
type ClientEvent = {
  id: string;
  sourceKey: string;
  entityId: number;
  kind: ClientReservationKind | "external";
  clientKey: string;
  // Código que recibe el cliente al confirmar (BIO-…, SAU-…). Los masajes y las
  // clases no lo tienen, por eso es opcional.
  bookingCode?: string | null;
  profileId?: number;
  service: ServiceKey;
  date: string;
  startTime: string | null;
  endTime: string | null;
  title: string;
  status: string;
  paymentStatus: string | null;
  amountClp: number;
  totalAmountClp: number;
  balanceAmountClp: number;
  people: number | null;
  href: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  detail: string | null;
  npsScore?: number | null;
  npsComment?: string | null;
};
type ClientEventActivityEntry = {
  id: string;
  label: string;
  detail?: string | null;
  at?: Date | string | null;
};
type ClientEventResponse = ClientEvent & {
  paidAmountClp: number;
  activityBucket: "upcoming" | "past" | "cancelled";
  activity: ClientEventActivityEntry[];
  hasPaymentRecord: boolean;
  canOpenDetail: boolean;
};
type ClientSummary = {
  key: string;
  profileId: number;
  name: string;
  email: string | null;
  phone: string | null;
  services: ServiceKey[];
  reservations: number;
  upcomingReservations: number;
  totalSpentClp: number;
  pendingBalanceClp: number;
  lastActivity: string;
  nextReservation: string | null;
  nextReservationEvent: ClientEventResponse | null;
};
type ClientProfileResponse = {
  profile: {
    id: number;
    key: string;
    name: string;
    email: string | null;
    phone: string | null;
    notes: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  };
  aliases: Array<{
    id: number;
    kind: "email" | "phone";
    value: string;
    normalizedValue: string;
    source: string;
  }>;
  summary: Partial<ClientSummary> & {
    reservations: number;
    upcomingReservations: number;
    totalSpentClp: number;
    pendingBalanceClp: number;
    nextReservation: string | null;
    services: ServiceKey[];
    lastActivity: string;
  };
  giftCards: Array<{
    id: number;
    code: string;
    amountClp: number;
    balanceClp: number;
    status: string;
    redemptionMode: string;
    serviceKey: string | null;
    serviceName: string | null;
    expiresAt: Date;
  }>;
  activity: Array<typeof client360Audit.$inferSelect>;
  canManageProfile: boolean;
  canMergeProfiles: boolean;
};

function serializeDate(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

export function normalizeClientEmail(value?: string | null): string | null {
  const normalized = String(value ?? "").trim().toLocaleLowerCase();
  return normalized && normalized.includes("@") ? normalized : null;
}

export function normalizeClientPhone(value?: string | null): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 9 && digits.startsWith("9")) return `56${digits}`;
  if (digits.length === 11 && digits.startsWith("56")) return digits;
  return digits.length >= 8 ? digits : null;
}

function clientIdentityKeys(input: {
  email?: string | null;
  phone?: string | null;
}): string[] {
  const email = normalizeClientEmail(input.email);
  const phone = normalizeClientPhone(input.phone);
  return [email ? `email:${email}` : null, phone ? `phone:${phone}` : null]
    .filter((value): value is string => Boolean(value));
}

function massageProgramTotalClp(input: {
  duration: number;
  modality: "simple" | "double";
}) {
  const unitPrice = input.duration === 30 ? 35_000 : 45_000;
  return unitPrice * (input.modality === "double" ? 2 : 1);
}

function massageProgramPaymentState(
  booking: typeof massageProgramBookings.$inferSelect,
  rows: Array<typeof reservationPayments.$inferSelect>
) {
  const totalClp = massageProgramTotalClp(booking);
  const paidClp = rows
    .filter(row => row.status === "paid")
    .reduce((sum, row) => sum + row.amountClp, 0);
  const legacyPaid = !rows.length && booking.paymentMethod !== "pending_payment";
  return {
    totalClp,
    paidClp: legacyPaid ? totalClp : paidClp,
    status:
      booking.status === "cancelled"
        ? null
        : legacyPaid || paidClp >= totalClp
          ? "paid"
          : "pending",
  };
}

export function buildClientKey(input: {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  sourceKey?: string;
}): string {
  const email = normalizeClientEmail(input.email);
  if (email) return `email:${email}`;
  const phone = normalizeClientPhone(input.phone);
  if (phone) return `phone:${phone}`;
  // Nunca se fusionan dos personas solo por compartir nombre. Si no existe
  // identidad utilizable, cada registro operativo conserva su propia clave.
  return `unidentified:${input.sourceKey ?? crypto.randomUUID()}`;
}

export function chooseClientProfileCandidate(input: {
  linkedProfileId?: number | null;
  emailProfileId?: number | null;
  phoneProfileId?: number | null;
}) {
  if (input.linkedProfileId) {
    return { profileId: input.linkedProfileId, conflict: false };
  }
  if (
    input.emailProfileId &&
    input.phoneProfileId &&
    input.emailProfileId !== input.phoneProfileId
  ) {
    // El correo tiene precedencia para este registro, pero no se fusionan las
    // fichas ni se mueve el teléfono: eso requiere una acción humana auditada.
    return { profileId: input.emailProfileId, conflict: true };
  }
  return {
    profileId: input.emailProfileId ?? input.phoneProfileId ?? null,
    conflict: false,
  };
}

export function resolveMergedClientProfileIds(
  profileIds: number[],
  profiles: Array<{ id: number; status: string; mergedIntoProfileId: number | null }>
): number[] {
  const byId = new Map(profiles.map(profile => [profile.id, profile]));
  const resolved = profileIds.map(profileId => {
    let current = profileId;
    const seen = new Set<number>();
    while (!seen.has(current)) {
      seen.add(current);
      const profile = byId.get(current);
      if (profile?.status !== "merged" || !profile.mergedIntoProfileId) break;
      current = profile.mergedIntoProfileId;
    }
    return current;
  });
  return Array.from(new Set(resolved));
}

export function isVisibleCalendarReservation(status?: string | null): boolean {
  return status !== "cancelled";
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function noteRescheduleActivities(notes: string | null | undefined, prefix: string) {
  return parseRescheduleAuditLines(notes).map((entry, index) => ({
    id: `rescheduled:${prefix}:${entry.timestamp}:${index}`,
    type: "activity" as const,
    label: entry.policyOverride
      ? "Reagendamiento con excepción"
      : "Reserva reagendada",
    detail: [
      `${entry.from.date} ${entry.from.time} → ${entry.to.date} ${entry.to.time}`,
      `Motivo: ${entry.reason}`,
      `Responsable: ${entry.actor}`,
      entry.policyViolations.length
        ? `Política omitida: ${entry.policyViolations.join("; ")}`
        : null,
    ]
      .filter(Boolean)
      .join(" · "),
    at: entry.timestamp,
  }));
}

function biopoolActivityPresentation(action: string, detail: string | null) {
  if (action !== "booking_rescheduled" || !detail) {
    return { label: action, detail };
  }
  try {
    const parsed = JSON.parse(detail);
    return {
      label: parsed.policyOverride
        ? "Reagendamiento con excepción"
        : "Reserva reagendada",
      detail: [
        parsed.from && parsed.to ? `${parsed.from} → ${parsed.to}` : null,
        parsed.reason ? `Motivo: ${parsed.reason}` : null,
        parsed.actor ? `Responsable: ${parsed.actor}` : null,
        parsed.policyOverride ? "Excepción administrativa autorizada" : null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  } catch {
    return { label: "Reserva reagendada", detail };
  }
}

type PaymentDetailRow = {
  id?: number;
  method: string;
  status: string;
  amountClp: number;
  reference?: string | null;
  cardType?: string | null;
  paidAt?: Date | string | null;
  createdAt?: Date | string | null;
};

export function buildPaymentDetail(input: {
  status?: string | null;
  method?: string | null;
  reference?: string | null;
  originalAmountClp?: unknown;
  discountAmountClp?: unknown;
  discountCode?: string | null;
  amountPaidClp?: unknown;
  refundAmountClp?: unknown;
  createdAt?: Date | string | null;
  rows?: PaymentDetailRow[];
  legacyMethod?: string | null;
  legacyReference?: string | null;
  legacyPaidAt?: Date | string | null;
  historicalDiscountCode?: string | null;
  historicalDiscountAmountClp?: unknown;
}) {
  const discountAmountClp = money(input.discountAmountClp);
  const reportedAmountPaidClp = money(input.amountPaidClp);
  const originalAmountClp = input.originalAmountClp == null
    ? Math.max(0, reportedAmountPaidClp + discountAmountClp)
    : money(input.originalAmountClp);
  const totalAmountClp = Math.max(0, originalAmountClp - discountAmountClp);
  const rows = input.rows ?? [];
  const lines: Array<{
    id: string;
    type: "discount" | "payment";
    method: string;
    status: string;
    amountClp: number;
    reference: string | null;
    cardType: string | null;
    at: Date | string | null;
  }> = [];
  if (discountAmountClp > 0) {
    lines.push({
      id: "discount",
      type: "discount",
      method: "Código de descuento",
      status: "applied",
      amountClp: discountAmountClp,
      reference: input.discountCode ?? null,
      cardType: null,
      at: input.createdAt ?? null,
    });
  } else if (input.historicalDiscountCode && money(input.historicalDiscountAmountClp) > 0) {
    lines.push({
      id: "discount:historical",
      type: "discount",
      method: "Código de descuento",
      status: "removed",
      amountClp: money(input.historicalDiscountAmountClp),
      reference: input.historicalDiscountCode,
      cardType: null,
      at: input.createdAt ?? null,
    });
  }
  const detailedPaidClp = rows
    .filter(row => row.status === "paid")
    .reduce((sum, row) => sum + money(row.amountClp), 0);
  // Algunos checkouts históricos guardaron el precio en amountPaid mientras
  // la reserva aún seguía pendiente. Solo se reconoce el excedente legacy si
  // el estado de la reserva confirma que hubo un pago real.
  const recognizesLegacyPaid = ["paid", "partially_paid", "partially_refunded", "refunded"].includes(input.status ?? "");
  const legacyPaidClp = recognizesLegacyPaid
    ? Math.max(0, reportedAmountPaidClp - detailedPaidClp)
    : 0;
  const amountPaidClp = detailedPaidClp + legacyPaidClp;
  if (legacyPaidClp > 0 || (!rows.length && input.method)) {
    lines.push({
      id: "payment:summary",
      type: "payment",
      method: input.legacyMethod ?? input.method ?? "Sin registrar",
      status: input.status ?? "paid",
      amountClp: legacyPaidClp || amountPaidClp,
      reference: input.legacyReference ?? input.reference ?? null,
      cardType: null,
      at: input.legacyPaidAt ?? input.createdAt ?? null,
    });
  }
  if (rows.length) {
    lines.push(...rows.map((row, index) => ({
      id: `payment:${row.id ?? index}`,
      type: "payment" as const,
      method: row.method,
      status: row.status,
      amountClp: money(row.amountClp),
      reference: row.reference ?? null,
      cardType: row.cardType ?? null,
      at: row.paidAt ?? row.createdAt ?? null,
    })));
  }
  return {
    status: input.status ?? null,
    method: input.method ?? null,
    reference: input.reference ?? null,
    amountClp: amountPaidClp,
    refundAmountClp: money(input.refundAmountClp),
    originalAmountClp,
    discountAmountClp,
    discountCode: input.discountCode ?? null,
    totalAmountClp,
    balanceAmountClp: Math.max(0, totalAmountClp - amountPaidClp),
    overpaymentAmountClp: Math.max(0, amountPaidClp - totalAmountClp),
    lines,
  };
}

async function database() {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Base de datos no disponible",
    });
  }
  return db;
}

function calendarServices(user: PermissionUser): CalendarServiceKey[] {
  return [
    ...(hasCmsPermission(user, "module.massages") ? ["massages" as const] : []),
    ...(hasCmsPermission(user, "module.biopools") ? ["biopools" as const] : []),
    ...(hasCmsPermission(user, "module.sauna") ? ["sauna" as const] : []),
    ...(hasCmsPermission(user, "module.regular_classes") ? ["regular_classes" as const] : []),
  ];
}

function clientServices(user: PermissionUser): ServiceKey[] {
  return [
    ...(hasCmsPermission(user, "massages.view_clients") ? ["massages" as const] : []),
    ...(hasCmsPermission(user, "biopools.view_clients") ? ["biopools" as const] : []),
    ...(hasCmsPermission(user, "sauna.view_clients") ? ["sauna" as const] : []),
    ...(hasCmsPermission(user, "regular_classes.students") ? ["regular_classes" as const] : []),
  ];
}

function canManageClientProfiles(user: PermissionUser): boolean {
  return (
    hasCmsPermission(user, "massages.manage_agenda") ||
    hasCmsPermission(user, "biopools.manage_agenda") ||
    hasCmsPermission(user, "sauna.manage_agenda") ||
    hasCmsPermission(user, "regular_classes.students")
  );
}

function assertClientProfileAccess(user: PermissionUser) {
  if (!clientServices(user).length) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No tienes permisos para ver información de clientes",
    });
  }
}

function assertClientProfileManageAccess(user: PermissionUser) {
  assertClientProfileAccess(user);
  if (!canManageClientProfiles(user)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No tienes permisos para modificar fichas de clientes",
    });
  }
}

function assertRange(from: string, to: string) {
  const days =
    (new Date(`${to}T12:00:00Z`).getTime() -
      new Date(`${from}T12:00:00Z`).getTime()) /
    86_400_000;
  if (days < 0 || days > 93) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "El rango del calendario debe ser de hasta 93 días",
    });
  }
}

function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function loadRawClientEvents(user: PermissionUser): Promise<ClientEvent[]> {
  const db = await database();
  const allowed = clientServices(user);
  if (!allowed.length) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No tienes permisos para ver información de clientes",
    });
  }

  const events: ClientEvent[] = [];
  if (allowed.includes("massages")) {
    const [standard, programs, npsResponses, programPaymentRows] = await Promise.all([
      db
        .select({
          id: massageBookings.id,
          name: massageBookings.clientName,
          email: massageBookings.clientEmail,
          phone: massageBookings.clientPhone,
          date: massageBookings.bookingDate,
          time: massageBookings.startTime,
          endTime: massageBookings.endTime,
          status: massageBookings.status,
          paymentStatus: massageBookings.paymentStatus,
          amount: massageBookings.amountPaid,
          originalAmount: massageBookings.originalAmount,
          discountAmount: massageBookings.discountAmount,
          title: massageTechniques.name,
          notes: massageBookings.notes,
        })
        .from(massageBookings)
        .leftJoin(massageTechniques, eq(massageBookings.techniqueId, massageTechniques.id)),
      db.select().from(massageProgramBookings),
      db.select().from(massageNpsResponses),
      db.select().from(reservationPayments)
        .where(eq(reservationPayments.module, "massage_programs")),
    ]);
    for (const row of standard) {
      const sourceKey = `massage:${row.id}`;
      const nps = npsResponses.find(item => item.bookingType === "massage" && item.bookingId === row.id);
      const amountClp = row.paymentStatus === "refunded" ? 0 : money(row.amount);
      const totalAmountClp = Math.max(
        0,
        row.originalAmount == null
          ? amountClp
          : money(row.originalAmount) - money(row.discountAmount)
      );
      events.push({
        id: sourceKey,
        sourceKey,
        entityId: row.id,
        kind: "massage",
        clientKey: buildClientKey({ ...row, sourceKey }),
        service: "massages",
        date: serializeDate(row.date),
        startTime: row.time,
        endTime: row.endTime,
        title: row.title ?? "Masaje",
        status: row.status,
        paymentStatus: row.paymentStatus,
        amountClp,
        totalAmountClp,
        balanceAmountClp: row.status === "cancelled" ? 0 : Math.max(0, totalAmountClp - amountClp),
        people: 1,
        href: `/cms/masajes/agenda?date=${serializeDate(row.date)}`,
        clientName: row.name,
        clientEmail: row.email,
        clientPhone: row.phone,
        detail: row.notes,
        npsScore: nps?.score ?? null,
        npsComment: nps?.comment ?? null,
      });
    }
    for (const row of programs) {
      const sourceKey = `massage_program:${row.id}`;
      const nps = npsResponses.find(item => item.bookingType === "skedu_program" && item.bookingId === row.id);
      const payment = massageProgramPaymentState(
        row,
        programPaymentRows.filter(item => item.reservationId === row.id)
      );
      events.push({
        id: `massage-program:${row.id}`,
        sourceKey,
        entityId: row.id,
        kind: "massage_program",
        clientKey: buildClientKey({ email: row.clientEmail, phone: row.clientPhone, name: row.clientName, sourceKey }),
        service: "massages",
        date: serializeDate(row.bookingDate),
        startTime: row.startTime,
        endTime: row.endTime,
        title: `Programa ${row.program.replaceAll("_", " ")}`,
        status: row.status,
        paymentStatus: payment.status,
        amountClp: payment.paidClp,
        totalAmountClp: payment.totalClp,
        balanceAmountClp: row.status === "cancelled" ? 0 : Math.max(0, payment.totalClp - payment.paidClp),
        people: row.modality === "double" ? 2 : 1,
        href: `/cms/masajes/agenda?date=${serializeDate(row.bookingDate)}`,
        clientName: row.clientName,
        clientEmail: row.clientEmail,
        clientPhone: row.clientPhone,
        detail: [row.secondClientName ? `Acompañante: ${row.secondClientName}` : null, row.notes]
          .filter(Boolean)
          .join(" · ") || null,
        npsScore: nps?.score ?? null,
        npsComment: nps?.comment ?? null,
      });
    }
  }

  if (allowed.includes("biopools")) {
    const rows = await db
      .select({ booking: biopoolBookings, serviceName: biopoolServices.name })
      .from(biopoolBookings)
      .innerJoin(biopoolServices, eq(biopoolBookings.serviceId, biopoolServices.id));
    for (const { booking, serviceName } of rows) {
      const sourceKey = `biopool:${booking.id}`;
      const totalAmountClp = Math.max(0, booking.originalAmountClp - booking.discountAmountClp);
      events.push({
        id: sourceKey,
        sourceKey,
        entityId: booking.id,
        kind: "biopool",
        bookingCode: booking.bookingCode,
        clientKey: buildClientKey({
          email: booking.clientEmail,
          phone: booking.clientPhone,
          name: booking.clientName,
          sourceKey,
        }),
        service: "biopools",
        date: serializeDate(booking.bookingDate),
        startTime: booking.startTime,
        endTime: booking.endTime,
        title: serviceName,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        amountClp: Math.max(0, booking.amountPaidClp - booking.refundAmountClp),
        totalAmountClp,
        balanceAmountClp: booking.status === "cancelled"
          ? 0
          : Math.max(0, totalAmountClp - Math.max(0, booking.amountPaidClp - booking.refundAmountClp)),
        people: booking.totalGuests,
        href: `/cms/biopiscinas/agenda?date=${serializeDate(booking.bookingDate)}`,
        clientName: booking.clientName,
        clientEmail: booking.clientEmail,
        clientPhone: booking.clientPhone,
        detail: `${booking.adultQuantity} adulto(s) · ${booking.childQuantity} niño(s)`,
      });
    }
  }

  // El sauna no estaba en esta función, así que sus reservas no aparecían ni en
  // la ficha del cliente ni en las búsquedas.
  if (allowed.includes("sauna")) {
    const rows = await db.select().from(saunaBookings);
    for (const booking of rows) {
      const sourceKey = `sauna:${booking.id}`;
      // Sauna no conserva el monto parcial reembolsado. Un reembolso total no
      // se cuenta; partially_refunded mantiene el monto informado como mejor
      // aproximación hasta que el proveedor exponga el neto.
      const amountClp = booking.paymentStatus === "refunded" ? 0 : booking.amountPaidClp;
      const totalAmountClp = booking.amountClp;
      events.push({
        id: sourceKey,
        sourceKey,
        entityId: booking.id,
        kind: "sauna",
        bookingCode: booking.bookingCode,
        clientKey: buildClientKey({
          email: booking.clientEmail,
          phone: booking.clientPhone,
          name: booking.clientName,
          sourceKey,
        }),
        service: "sauna",
        date: serializeDate(booking.bookingDate),
        startTime: booking.startTime,
        endTime: booking.endTime,
        title: booking.serviceName,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        amountClp,
        totalAmountClp,
        balanceAmountClp: booking.status === "cancelled" ? 0 : Math.max(0, totalAmountClp - amountClp),
        people: booking.guests,
        href: `/cms/sauna/agenda?date=${serializeDate(booking.bookingDate)}`,
        clientName: booking.clientName ?? "Sin cliente registrado",
        clientEmail: booking.clientEmail,
        clientPhone: booking.clientPhone,
        detail: [
          `${booking.guests} persona(s)${booking.isPrivate ? " · privado" : ""}`,
          booking.notes,
        ].filter(Boolean).join(" · "),
      });
    }
  }

  if (allowed.includes("regular_classes")) {
    const [membershipRows, attendanceRows] = await Promise.all([
      db
        .select({
          membership: regularClassMemberships,
          student: regularClassStudents,
          planName: regularClassPlans.name,
        })
        .from(regularClassMemberships)
        .innerJoin(regularClassStudents, eq(regularClassMemberships.studentId, regularClassStudents.id))
        .innerJoin(regularClassPlans, eq(regularClassMemberships.planId, regularClassPlans.id)),
      db
        .select({
          attendance: regularClassAttendances,
          session: regularClassSessions,
          disciplineName: regularClassDisciplines.name,
          student: regularClassStudents,
        })
        .from(regularClassAttendances)
        .innerJoin(regularClassSessions, eq(regularClassAttendances.sessionId, regularClassSessions.id))
        .innerJoin(regularClassDisciplines, eq(regularClassSessions.disciplineId, regularClassDisciplines.id))
        .innerJoin(regularClassStudents, eq(regularClassAttendances.studentId, regularClassStudents.id)),
    ]);
    for (const { membership, student, planName } of membershipRows) {
      const name = [student.firstName, student.lastName].filter(Boolean).join(" ");
      const sourceKey = `regular_class_membership:${membership.id}`;
      const totalAmountClp = Math.max(0, membership.originalAmountClp - membership.discountAmountClp);
      const amountClp = membership.paymentStatus === "paid" ? membership.pricePaidClp : 0;
      events.push({
        id: `regular-class-membership:${membership.id}`,
        sourceKey,
        entityId: membership.id,
        kind: "regular_class_membership",
        clientKey: buildClientKey({ email: student.email, phone: student.phone, name, sourceKey }),
        service: "regular_classes",
        date: serializeDate(membership.periodStart),
        startTime: null,
        endTime: null,
        title: planName,
        status: membership.status,
        paymentStatus: membership.paymentStatus,
        amountClp,
        totalAmountClp,
        balanceAmountClp: membership.status === "cancelled" ? 0 : Math.max(0, totalAmountClp - amountClp),
        people: 1,
        href: "/cms/clases-regulares/alumnos",
        clientName: name,
        clientEmail: student.email,
        clientPhone: student.phone,
        detail: `Vigencia hasta ${serializeDate(membership.periodEnd)}`,
      });
    }
    for (const row of attendanceRows) {
      const name = [row.student.firstName, row.student.lastName].filter(Boolean).join(" ");
      const sourceKey = `regular_class_attendance:${row.attendance.id}`;
      const cancelled = row.session.status === "cancelled" || row.attendance.status === "void";
      events.push({
        id: `regular-class-attendance:${row.attendance.id}`,
        sourceKey,
        // ReservationDetail abre la sesión; sourceKey mantiene individual a la persona.
        entityId: row.session.id,
        kind: "regular_class",
        clientKey: buildClientKey({ email: row.student.email, phone: row.student.phone, name, sourceKey }),
        service: "regular_classes",
        date: serializeDate(row.session.sessionDate),
        startTime: row.session.startTime,
        endTime: row.session.endTime,
        title: row.disciplineName,
        status: cancelled ? "cancelled" : row.session.status,
        // La membresía es el registro financiero; la asistencia no duplica ese pago.
        paymentStatus: null,
        amountClp: 0,
        totalAmountClp: 0,
        balanceAmountClp: 0,
        people: 1,
        href: `/cms/clases-regulares/asistencia?date=${serializeDate(row.session.sessionDate)}`,
        clientName: name,
        clientEmail: row.student.email,
        clientPhone: row.student.phone,
        detail: row.attendance.notes,
      });
    }
  }
  return events;
}

/** Quita tildes, pasa a minúsculas y colapsa espacios: "Andrés  Ñuñez" → "andres nunez". */
function normalizarBusqueda(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Distancia de edición acotada: si se pasa del tope, corta y devuelve tope+1.
 * No hace falta el valor exacto, solo saber si entra o no dentro del margen.
 */
function distanciaEdicion(a: string, b: string, tope: number): number {
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  let previa = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      actual.push(
        Math.min(
          previa[j] + 1,
          actual[j - 1] + 1,
          previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        )
      );
    }
    if (Math.min(...actual) > tope) return tope + 1;
    previa = actual;
  }
  return previa[b.length];
}

/**
 * Cuántas letras de diferencia se le perdonan a una palabra según su largo.
 * Las de 3 letras o menos van exactas: ahí un error de una letra ya es otra
 * palabra distinta y ensucia los resultados.
 */
function margenTipeo(palabra: string): number {
  if (palabra.length <= 3) return 0;
  return palabra.length <= 8 ? 1 : 2;
}

/**
 * Match tolerante a nombres mal escritos: "Willian Toro" encuentra a
 * "william toro", "Fernando Mesa" a "FERNANDO MEZA". Exige que TODAS las
 * palabras buscadas tengan pareja, que es lo que evita que media base entre
 * por parecerse a una sola palabra.
 */
function pareceA(termino: string, texto: string): boolean {
  const palabras = normalizarBusqueda(termino).split(" ").filter(Boolean);
  const candidatas = normalizarBusqueda(texto).split(" ").filter(Boolean);
  if (!palabras.length || !candidatas.length) return false;
  return palabras.every(palabra => {
    const margen = margenTipeo(palabra);
    return candidatas.some(
      candidata =>
        candidata.startsWith(palabra) ||
        (margen > 0 && distanciaEdicion(palabra, candidata, margen) <= margen)
    );
  });
}

async function materializeClientProfiles(
  events: ClientEvent[]
): Promise<ClientEvent[]> {
  if (!events.length) return events;
  const db = await database();
  const [profiles, identities, links] = await Promise.all([
    db.select().from(client360Profiles),
    db.select().from(client360Identities),
    db.select().from(client360ReservationLinks),
  ]);
  const profilesById = new Map(profiles.map(profile => [profile.id, profile]));
  const profilesByIdentity = new Map<string, Set<number>>();
  for (const identity of identities) {
    const current = profilesByIdentity.get(identity.identityKey) ?? new Set<number>();
    current.add(identity.profileId);
    profilesByIdentity.set(identity.identityKey, current);
  }
  const linksBySource = new Map(links.map(link => [link.sourceKey, link.profileId]));

  const activeProfileId = (profileId: number): number => {
    let currentId = profileId;
    const seen = new Set<number>();
    while (!seen.has(currentId)) {
      seen.add(currentId);
      const current = profilesById.get(currentId);
      if (current?.status !== "merged" || !current.mergedIntoProfileId) break;
      currentId = current.mergedIntoProfileId;
    }
    return currentId;
  };
  const singleActiveProfileForIdentity = (key: string | null) => {
    if (!key) return null;
    const candidates = profilesByIdentity.get(key);
    if (!candidates) return null;
    const activeCandidates = new Set(Array.from(candidates).map(activeProfileId));
    return activeCandidates.size === 1 ? Array.from(activeCandidates)[0] : null;
  };

  for (const event of events) {
    const keys = clientIdentityKeys({ email: event.clientEmail, phone: event.clientPhone });
    const emailKey = keys.find(key => key.startsWith("email:")) ?? null;
    const phoneKey = keys.find(key => key.startsWith("phone:")) ?? null;
    const linkedProfileId = linksBySource.get(event.sourceKey);
    const decision = chooseClientProfileCandidate({
      linkedProfileId: linkedProfileId ? activeProfileId(linkedProfileId) : null,
      emailProfileId: singleActiveProfileForIdentity(emailKey),
      phoneProfileId: singleActiveProfileForIdentity(phoneKey),
    });
    let profileId = decision.profileId ? activeProfileId(decision.profileId) : null;

    if (!profileId) {
      const originKey = `reservation:${event.sourceKey}`;
      const [existing] = await db.select().from(client360Profiles)
        .where(eq(client360Profiles.originKey, originKey)).limit(1);
      if (existing) {
        profileId = activeProfileId(existing.id);
        profilesById.set(existing.id, existing);
      } else {
        const profileValues = {
          originKey,
          displayName: event.clientName || "Cliente sin identificar",
          primaryEmail: normalizeClientEmail(event.clientEmail),
          primaryPhone: event.clientPhone?.trim() || null,
        };
        await db.insert(client360Profiles).values(profileValues)
          .onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });
        const [persisted] = await db.select().from(client360Profiles)
          .where(eq(client360Profiles.originKey, originKey)).limit(1);
        if (!persisted) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "No fue posible crear la ficha del cliente",
          });
        }
        profileId = activeProfileId(persisted.id);
        profilesById.set(persisted.id, persisted);
        await db.insert(client360Audit).values({
          profileId,
          action: "profile_created_automatically",
          detail: JSON.stringify({ sourceKey: event.sourceKey }),
        });
      }
    }

    for (const key of keys) {
      const current = profilesByIdentity.get(key) ?? new Set<number>();
      if (current.has(profileId)) continue;
      const [kind, ...valueParts] = key.split(":");
      const normalizedValue = valueParts.join(":");
      await db.insert(client360Identities).values({
        profileId,
        kind: kind as "email" | "phone",
        identityKey: key,
        normalizedValue,
        displayValue: kind === "email" ? event.clientEmail : event.clientPhone,
        source: event.service,
      }).onDuplicateKeyUpdate({ set: { displayValue: kind === "email" ? event.clientEmail : event.clientPhone } });
      current.add(profileId);
      profilesByIdentity.set(key, current);
    }

    if (!linkedProfileId) {
      await db.insert(client360ReservationLinks).values({
        profileId,
        reservationKind: event.kind,
        reservationId: event.entityId,
        sourceKey: event.sourceKey,
        linkedBy: "automatic",
      }).onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });
      linksBySource.set(event.sourceKey, profileId);
      await db.insert(client360Audit).values({
        profileId,
        action: decision.conflict ? "reservation_linked_with_identity_conflict" : "reservation_linked_automatically",
        detail: JSON.stringify({
          sourceKey: event.sourceKey,
          emailKey,
          phoneKey,
        }),
      });
    }
    event.profileId = profileId;
    event.clientKey = `profile:${profileId}`;
  }
  return events;
}

async function loadClientEvents(user: PermissionUser): Promise<ClientEvent[]> {
  const localEvents = await materializeClientProfiles(await loadRawClientEvents(user));
  const db = await database();
  const allowed = clientServices(user);
  const externalRows = await db.select().from(client360ExternalEvents);
  const externalEvents: ClientEvent[] = externalRows.flatMap(row => {
    if (!row.profileId || row.nativeKind || row.nativeReservationId) return [];
    const parsedService = serviceSchema.safeParse(row.serviceKey);
    if (!parsedService.success || !allowed.includes(parsedService.data)) return [];
    return [{
      id: `external:${row.externalId}`,
      sourceKey: row.externalKey,
      entityId: row.id,
      kind: "external" as const,
      clientKey: `profile:${row.profileId}`,
      profileId: row.profileId,
      service: parsedService.data,
      date: serializeDate(row.eventDate),
      startTime: row.startTime,
      endTime: row.endTime,
      title: row.serviceName,
      status: row.status,
      paymentStatus: row.paymentStatus,
      // El precio de sesión de Skedu no acredita un pago.
      amountClp: 0,
      totalAmountClp: row.listedAmountClp,
      balanceAmountClp: 0,
      people: null,
      href: "",
      clientName: row.clientName ?? "Cliente Skedu",
      clientEmail: row.clientEmail,
      clientPhone: row.clientPhone,
      detail: [row.variantName, "Historial Skedu (solo lectura)"].filter(Boolean).join(" · "),
    }];
  });
  return [...localEvents, ...externalEvents];
}

function cancaguaNowKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")} ${value("hour")}:${value("minute")}`;
}

function clientEventActivity(
  event: ClientEvent,
  nowKey = cancaguaNowKey()
): "upcoming" | "past" | "cancelled" {
  if (event.status === "cancelled") return "cancelled";
  return `${event.date} ${event.startTime ?? "00:00"}` >= nowKey ? "upcoming" : "past";
}

function clientEventResponse(event: ClientEvent, user: PermissionUser) {
  const classAttendance = event.sourceKey.startsWith("regular_class_attendance:");
  const classMembership = event.kind === "regular_class_membership";
  const external = event.kind === "external";
  return {
    ...event,
    paidAmountClp: event.amountClp,
    activityBucket: clientEventActivity(event),
    activity: [],
    hasPaymentRecord: !classAttendance && !external,
    canOpenDetail:
      !classAttendance &&
      !classMembership &&
      !external &&
      calendarServices(user).includes(event.service),
  };
}

function inferLegacyServices(raw: string | null): ServiceKey[] {
  if (!raw) return [];
  let values: string[] = [];
  try {
    const parsed = JSON.parse(raw);
    values = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
  } catch {
    values = [raw];
  }
  const joined = values.join(" ").toLocaleLowerCase();
  return Array.from(new Set<ServiceKey>([
    ...(/masaj|programa/.test(joined) ? ["massages" as const] : []),
    ...(/biopisc|geoterm/.test(joined) ? ["biopools" as const] : []),
    ...(/sauna/.test(joined) ? ["sauna" as const] : []),
    ...(/yoga|pilates|clase|actividad/.test(joined) ? ["regular_classes" as const] : []),
  ]));
}

type ClientListFilters = {
  search?: string;
  service?: ServiceKey;
};

async function clientListData(user: PermissionUser, input: ClientListFilters) {
  assertClientProfileAccess(user);
  const db = await database();
  const allowed = clientServices(user);
  const events = await loadClientEvents(user);
  const includeLegacy = allowed.length === 4;
  const [allProfiles, legacyRows, identities] = await Promise.all([
    db.select().from(client360Profiles),
    includeLegacy ? db.select().from(skeduClients) : Promise.resolve([]),
    db.select().from(client360Identities),
  ]);
  const profilesById = new Map(allProfiles.map(profile => [profile.id, profile]));
  const activeProfileId = (profileId: number) => {
    let current = profileId;
    const seen = new Set<number>();
    while (!seen.has(current)) {
      seen.add(current);
      const profile = profilesById.get(current);
      if (profile?.status !== "merged" || !profile.mergedIntoProfileId) break;
      current = profile.mergedIntoProfileId;
    }
    return current;
  };
  const profiles = allProfiles.filter(profile => profile.status === "active");
  const aliasesByProfile = new Map<number, string[]>();
  for (const identity of identities) {
    const ownerId = activeProfileId(identity.profileId);
    const current = aliasesByProfile.get(ownerId) ?? [];
    current.push(identity.displayValue ?? identity.normalizedValue);
    aliasesByProfile.set(ownerId, current);
  }
  const legacyByProfileId = new Map<number, Array<typeof skeduClients.$inferSelect>>();
  const profilesByOrigin = new Map(
    allProfiles
      .filter(profile => profile.originKey)
      .map(profile => [profile.originKey!, profilesById.get(activeProfileId(profile.id))!])
  );
  for (const legacy of legacyRows) {
    const profile = profilesByOrigin.get(`legacy_client:${legacy.id}`);
    if (profile) {
      const current = legacyByProfileId.get(profile.id) ?? [];
      current.push(legacy);
      legacyByProfileId.set(profile.id, current);
    }
  }
  const eventsByProfile = new Map<number, ClientEvent[]>();
  for (const event of events) {
    if (!event.profileId) continue;
    const current = eventsByProfile.get(event.profileId) ?? [];
    current.push(event);
    eventsByProfile.set(event.profileId, current);
  }
  const search = input.search?.trim().toLocaleLowerCase() ?? "";
  const nowKey = cancaguaNowKey();

  return profiles
    .filter(profile => {
      if (eventsByProfile.has(profile.id) || legacyByProfileId.has(profile.id)) return true;
      return (
        profile.originKey?.startsWith("regular_class_student:") &&
        allowed.includes("regular_classes")
      );
    })
    .map(profile => {
      const history = (eventsByProfile.get(profile.id) ?? []).sort((a, b) =>
        `${b.date} ${b.startTime ?? ""}`.localeCompare(`${a.date} ${a.startTime ?? ""}`)
      );
      const legacy = legacyByProfileId.get(profile.id) ?? [];
      const services = Array.from(new Set<ServiceKey>([
        ...history.map(item => item.service),
        ...legacy.flatMap(row => inferLegacyServices(row.serviciosUsados)),
        ...(profile.originKey?.startsWith("regular_class_student:") ? ["regular_classes" as const] : []),
      ]));
      const upcoming = history
        .filter(item => clientEventActivity(item, nowKey) === "upcoming")
        .sort((a, b) => `${a.date} ${a.startTime ?? ""}`.localeCompare(`${b.date} ${b.startTime ?? ""}`));
      const detailedSpentClp = history.reduce((sum, item) => sum + item.amountClp, 0);
      const detailedReservations = history.length;
      const legacySpentClp = legacy.reduce((sum, row) => sum + money(row.totalGasto), 0);
      const legacyReservations = legacy.reduce((sum, row) => sum + money(row.totalVisitas), 0);
      const latestEventDate = history[0]?.date ?? "";
      const legacyActivity = legacy
        .map(row => row.ultimaVisita ? serializeDate(row.ultimaVisita) : "")
        .filter(Boolean)
        .sort()
        .at(-1) ?? "";
      const activityAfterLegacy = legacyActivity
        ? history.filter(item => item.date > legacyActivity)
        : [];
      const totalSpentClp = legacyActivity
        ? legacySpentClp + activityAfterLegacy.reduce((sum, item) => sum + item.amountClp, 0)
        : Math.max(detailedSpentClp, legacySpentClp);
      const reservations = legacyActivity
        ? legacyReservations + activityAfterLegacy.length
        : Math.max(detailedReservations, legacyReservations);
      return {
        key: `profile:${profile.id}`,
        profileId: profile.id,
        name: profile.displayName,
        email: profile.primaryEmail,
        phone: profile.primaryPhone,
        services,
        reservations,
        upcomingReservations: upcoming.length,
        totalSpentClp,
        pendingBalanceClp: history.reduce((sum, item) => sum + item.balanceAmountClp, 0),
        lastActivity: [latestEventDate, legacyActivity, serializeDate(profile.updatedAt)]
          .filter(Boolean)
          .sort()
          .at(-1)!,
        nextReservation: upcoming[0]?.date ?? null,
        nextReservationEvent: upcoming[0] ? clientEventResponse(upcoming[0], user) : null,
      };
    })
    .filter(client => !input.service || client.services.includes(input.service))
    .filter(client =>
      !search ||
      [client.name, client.email, client.phone]
        .concat(aliasesByProfile.get(client.profileId) ?? [])
        .filter(Boolean)
        .some(value => value!.toLocaleLowerCase().includes(search))
    )
    .sort((a, b) =>
      b.lastActivity.localeCompare(a.lastActivity) || b.profileId - a.profileId
    );
}

async function assertClientProfileVisible(user: PermissionUser, profileId: number) {
  assertClientProfileAccess(user);
  const db = await database();
  const [profile] = await db.select().from(client360Profiles)
    .where(eq(client360Profiles.id, profileId)).limit(1);
  if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
  const allowed = clientServices(user);
  if (allowed.length === 4) return profile;
  if (
    profile.originKey?.startsWith("regular_class_student:") &&
    allowed.includes("regular_classes")
  ) return profile;
  const events = await loadClientEvents(user);
  if (!events.some(event => event.profileId === profileId)) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  return profile;
}

async function resolveClientProfileId(input: {
  profileId?: number;
  clientKey?: string;
}): Promise<number> {
  if (input.profileId) return input.profileId;
  if (input.clientKey?.startsWith("profile:")) {
    const parsed = Number(input.clientKey.slice("profile:".length));
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  if (input.clientKey?.startsWith("email:") || input.clientKey?.startsWith("phone:")) {
    const db = await database();
    const rows = await db.select().from(client360Identities)
      .where(eq(client360Identities.identityKey, input.clientKey));
    const rawProfileIds = Array.from(new Set(rows.map(row => row.profileId)));
    const profiles = rawProfileIds.length
      ? await db.select({
          id: client360Profiles.id,
          status: client360Profiles.status,
          mergedIntoProfileId: client360Profiles.mergedIntoProfileId,
        }).from(client360Profiles).where(inArray(client360Profiles.id, rawProfileIds))
      : [];
    const profileIds = resolveMergedClientProfileIds(rawProfileIds, profiles);
    if (profileIds.length === 1) return profileIds[0];
    if (profileIds.length > 1) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "El correo o teléfono pertenece a más de una ficha; selecciona la ficha exacta",
      });
    }
  }
  throw new TRPCError({ code: "NOT_FOUND", message: "Ficha de cliente no encontrada" });
}

function normalizeReservationReference(
  reference: z.infer<typeof clientReservationReferenceSchema>
): { kind: ClientReservationKind; entityId: number } {
  if ("kind" in reference) return reference;
  const kindByService = {
    massages: "massage",
    massage_programs: "massage_program",
    biopools: "biopool",
    sauna: "sauna",
    regular_classes: "regular_class",
  } as const;
  return {
    kind: kindByService[reference.service],
    entityId: reference.reservationId,
  };
}

function assertCanLinkReservation(user: PermissionUser, kind: ClientReservationKind) {
  const permitted =
    (kind === "massage" || kind === "massage_program")
      ? hasCmsPermission(user, "massages.manage_agenda")
      : kind === "biopool"
        ? hasCmsPermission(user, "biopools.manage_agenda")
        : kind === "sauna"
          ? hasCmsPermission(user, "sauna.manage_agenda")
          : hasCmsPermission(user, "regular_classes.students");
  if (!permitted) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No tienes permisos para vincular una reserva de este servicio",
    });
  }
}

async function reservationReferenceExists(
  db: Awaited<ReturnType<typeof database>>,
  reference: { kind: ClientReservationKind; entityId: number }
): Promise<boolean> {
  if (reference.kind === "massage") {
    return Boolean((await db.select({ id: massageBookings.id }).from(massageBookings)
      .where(eq(massageBookings.id, reference.entityId)).limit(1))[0]);
  }
  if (reference.kind === "massage_program") {
    return Boolean((await db.select({ id: massageProgramBookings.id }).from(massageProgramBookings)
      .where(eq(massageProgramBookings.id, reference.entityId)).limit(1))[0]);
  }
  if (reference.kind === "biopool") {
    return Boolean((await db.select({ id: biopoolBookings.id }).from(biopoolBookings)
      .where(eq(biopoolBookings.id, reference.entityId)).limit(1))[0]);
  }
  if (reference.kind === "sauna") {
    return Boolean((await db.select({ id: saunaBookings.id }).from(saunaBookings)
      .where(eq(saunaBookings.id, reference.entityId)).limit(1))[0]);
  }
  if (reference.kind === "regular_class_membership") {
    return Boolean((await db.select({ id: regularClassMemberships.id }).from(regularClassMemberships)
      .where(eq(regularClassMemberships.id, reference.entityId)).limit(1))[0]);
  }
  return Boolean((await db.select({ id: regularClassSessions.id }).from(regularClassSessions)
    .where(eq(regularClassSessions.id, reference.entityId)).limit(1))[0]);
}

export function inferSkeduClientService(serviceName: unknown): ServiceKey | "other" {
  const value = String(serviceName ?? "").toLocaleLowerCase();
  if (/masaj|pulso|reconecta|programa/.test(value)) return "massages";
  if (/biopisc|geoterm/.test(value)) return "biopools";
  if (/sauna/.test(value)) return "sauna";
  if (/yoga|pilates|clase|entrenamiento|nataci[oó]n|hatha/.test(value)) return "regular_classes";
  return "other";
}

function skeduLocalDateTime(value: unknown): { date: string; time: string | null } | null {
  const parsed = new Date(String(value ?? ""));
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parsed);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(item => item.type === type)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

export function santiagoLocalMidnightUtc(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Santiago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find(part => part.type === type)?.value ?? 0);
    const renderedAsUtc = Date.UTC(
      value("year"),
      value("month") - 1,
      value("day"),
      value("hour"),
      value("minute"),
      value("second"),
    );
    const delta = target - renderedAsUtc;
    guess += delta;
    if (delta === 0) break;
  }
  return new Date(guess).toISOString();
}

function nextDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

export function skeduClientEventStatus(appointment: Record<string, any>) {
  if (appointment.DeletedAt || appointment.RealDeletedAt) return "cancelled";
  if (appointment.IsTemporary || appointment.IsConfirmed === false) return "pending";
  return "confirmed";
}

export function deduplicateSkeduAppointments(rows: Array<Record<string, any>>) {
  const byUuid = new Map<string, Record<string, any>>();
  for (const row of rows) {
    const uuid = String(row.UUID ?? "").trim();
    if (!uuid) continue;
    const previous = byUuid.get(uuid);
    const previousUpdated = new Date(previous?.UpdatedAt ?? previous?.CreatedAt ?? 0).getTime();
    const nextUpdated = new Date(row.UpdatedAt ?? row.CreatedAt ?? 0).getTime();
    if (!previous || nextUpdated >= previousUpdated) byUuid.set(uuid, row);
  }
  return Array.from(byUuid.values());
}

function nullableDate(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export const operations360Router = router({
  access: protectedProcedure.query(({ ctx }) => ({
    calendarServices: calendarServices(ctx.user),
    clientServices: clientServices(ctx.user),
    canSyncClientHistory: isAdminRole(ctx.user.role),
    manualBookingServices: ([
      hasCmsPermission(ctx.user, "massages.manage_agenda") ? "massages" : null,
      hasCmsPermission(ctx.user, "biopools.manage_agenda") ? "biopools" : null,
      hasCmsPermission(ctx.user, "sauna.manage_agenda") ? "sauna" : null,
    ].filter(Boolean) as Array<"massages" | "biopools" | "sauna">),
  })),

  calendar: protectedProcedure
    .input(
      z.object({
        from: dateSchema,
        to: dateSchema,
        services: z.array(calendarServiceSchema).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      assertRange(input.from, input.to);
      const db = await database();
      const allowed = calendarServices(ctx.user);
      if (!allowed.length) throw new TRPCError({ code: "FORBIDDEN" });
      const selected = (input.services?.length ? input.services : allowed).filter(service =>
        allowed.includes(service)
      );
      const events: Array<Record<string, unknown>> = [];

      if (selected.includes("massages")) {
        const [standard, programs, programPaymentRows] = await Promise.all([
          db
            .select({
              id: massageBookings.id,
              date: massageBookings.bookingDate,
              startTime: massageBookings.startTime,
              endTime: massageBookings.endTime,
              status: massageBookings.status,
              paymentStatus: massageBookings.paymentStatus,
              clientName: massageBookings.clientName,
              techniqueName: massageTechniques.name,
            })
            .from(massageBookings)
            .leftJoin(massageTechniques, eq(massageBookings.techniqueId, massageTechniques.id))
            .where(
              and(
                gte(massageBookings.bookingDate, input.from as any),
                lte(massageBookings.bookingDate, input.to as any)
              )
            ),
          db
            .select()
            .from(massageProgramBookings)
            .where(
              and(
                gte(massageProgramBookings.bookingDate, input.from as any),
                lte(massageProgramBookings.bookingDate, input.to as any)
              )
            ),
          db
            .select()
            .from(reservationPayments)
            .where(eq(reservationPayments.module, "massage_programs")),
        ]);
        events.push(
          ...standard.map(row => ({
            id: `massage:${row.id}`,
            entityId: row.id,
            kind: "massage",
            service: "massages",
            date: serializeDate(row.date),
            startTime: row.startTime,
            endTime: row.endTime,
            title: row.techniqueName ?? "Masaje",
            clientName: row.clientName,
            status: row.status,
            paymentStatus: row.paymentStatus,
            people: 1,
            href: `/cms/masajes/agenda?date=${serializeDate(row.date)}`,
          })),
          ...programs.map(row => ({
            id: `massage-program:${row.id}`,
            entityId: row.id,
            kind: "massage_program",
            service: "massages",
            date: serializeDate(row.bookingDate),
            startTime: row.startTime,
            endTime: row.endTime,
            title: `Programa ${row.program.replaceAll("_", " ")}`,
            clientName: row.secondClientName
              ? `${row.clientName} / ${row.secondClientName}`
              : row.clientName,
            status: row.status,
            paymentStatus: massageProgramPaymentState(
              row,
              programPaymentRows.filter(item => item.reservationId === row.id)
            ).status,
            people: row.modality === "double" ? 2 : 1,
            href: `/cms/masajes/agenda?date=${serializeDate(row.bookingDate)}`,
          }))
        );
      }

      if (selected.includes("biopools")) {
        const rows = await db
          .select({ booking: biopoolBookings, serviceName: biopoolServices.name })
          .from(biopoolBookings)
          .innerJoin(biopoolServices, eq(biopoolBookings.serviceId, biopoolServices.id))
          .where(
            and(
              gte(biopoolBookings.bookingDate, input.from),
              lte(biopoolBookings.bookingDate, input.to)
            )
          );
        events.push(
          ...rows.map(({ booking, serviceName }) => ({
            id: `biopool:${booking.id}`,
            entityId: booking.id,
            kind: "biopool",
            service: "biopools",
            date: serializeDate(booking.bookingDate),
            startTime: booking.startTime,
            endTime: booking.endTime,
            title: serviceName,
            clientName: booking.clientName,
            status: booking.status,
            paymentStatus: booking.paymentStatus,
            people: booking.totalGuests,
            href: `/cms/biopiscinas/agenda?date=${serializeDate(booking.bookingDate)}`,
          }))
        );
      }

      if (selected.includes("sauna")) {
        const rows = await db
          .select()
          .from(saunaBookings)
          .where(
            and(
              gte(saunaBookings.bookingDate, input.from),
              lte(saunaBookings.bookingDate, input.to)
            )
          );
        events.push(
          ...rows.map(booking => ({
            id: `sauna:${booking.id}`,
            entityId: booking.id,
            kind: "sauna",
            service: "sauna",
            date: serializeDate(booking.bookingDate),
            startTime: booking.startTime,
            endTime: booking.endTime,
            title: booking.serviceName,
            clientName: booking.clientName ?? "Sin cliente registrado",
            status: booking.status,
            paymentStatus: booking.paymentStatus,
            people: booking.guests,
            href: `/cms/sauna/agenda?date=${serializeDate(booking.bookingDate)}`,
          }))
        );
      }

      if (selected.includes("regular_classes")) {
        const [schedules, sessionRows] = await Promise.all([
          db
            .select({
              id: regularClassSchedules.id,
              dayOfWeek: regularClassSchedules.dayOfWeek,
              startTime: regularClassSchedules.startTime,
              endTime: regularClassSchedules.endTime,
              validFrom: regularClassSchedules.validFrom,
              validTo: regularClassSchedules.validTo,
              disciplineName: regularClassDisciplines.name,
              teacherName: regularClassTeachers.name,
            })
            .from(regularClassSchedules)
            .innerJoin(
              regularClassDisciplines,
              eq(regularClassSchedules.disciplineId, regularClassDisciplines.id)
            )
            .innerJoin(
              regularClassTeachers,
              eq(regularClassSchedules.teacherId, regularClassTeachers.id)
            )
            .where(eq(regularClassSchedules.active, 1)),
          db
            .select({
              id: regularClassSessions.id,
              scheduleId: regularClassSessions.scheduleId,
              date: regularClassSessions.sessionDate,
              status: regularClassSessions.status,
            })
            .from(regularClassSessions)
            .where(
              and(
                gte(regularClassSessions.sessionDate, input.from),
                lte(regularClassSessions.sessionDate, input.to)
              )
            ),
        ]);
        const sessionIds = sessionRows.map(row => row.id);
        const attendanceRows = sessionIds.length
          ? await db
              .select()
              .from(regularClassAttendances)
              .where(
                and(
                  inArray(regularClassAttendances.sessionId, sessionIds),
                  eq(regularClassAttendances.status, "present")
                )
              )
          : [];
        for (const date of datesBetween(input.from, input.to)) {
          const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
          for (const schedule of schedules) {
            if (
              schedule.dayOfWeek !== weekday ||
              serializeDate(schedule.validFrom) > date ||
              (schedule.validTo && serializeDate(schedule.validTo) < date)
            ) continue;
            const session = sessionRows.find(row =>
              row.scheduleId === schedule.id && serializeDate(row.date) === date
            );
            events.push({
              id: session ? `regular-class:${session.id}` : `regular-class-schedule:${schedule.id}:${date}`,
              entityId: session?.id ?? schedule.id,
              kind: session ? "regular_class" : "regular_class_schedule",
              service: "regular_classes",
              date,
              startTime: schedule.startTime,
              endTime: schedule.endTime,
              title: schedule.disciplineName,
              clientName: schedule.teacherName,
              status: session?.status ?? "scheduled",
              paymentStatus: null,
              people: session
                ? attendanceRows.filter(item => item.sessionId === session.id).length
                : 0,
              href: `/cms/clases-regulares/asistencia?date=${date}`,
            });
          }
        }
      }

      return events
        .filter(event => isVisibleCalendarReservation(String(event.status ?? "")))
        .sort((left: any, right: any) =>
          `${left.date} ${left.startTime}`.localeCompare(`${right.date} ${right.startTime}`)
        );
    }),

  // Buscador de reservas: por código, nombre, correo o teléfono. Existe porque
  // buscar por el nombre que da el cliente falla cuando quien reservó puso otro
  // (una clienta preguntaba por "Maria Court" y la reserva decía solo "claudia").
  buscar: protectedProcedure
    .input(z.object({ termino: z.string().trim().min(2).max(120) }))
    .query(async ({ ctx, input }) => {
      // Recepción entra al calendario con solo tener un módulo, pero el buscador
      // necesita permiso sobre clientes. Antes esto era un 403 por pulsación y
      // la tarjeta de resultados quedaba vacía sin decir por qué.
      if (!clientServices(ctx.user).length) {
        // El tipo explícito importa: sin él este brazo devuelve never[] y el
        // .map() del cliente deja de compilar contra la unión de los dos returns.
        return { total: 0, aproximada: false, resultados: [] as ClientEvent[], sinPermisos: true };
      }
      const eventos = await loadClientEvents(ctx.user);
      const termino = normalizarBusqueda(input.termino);
      const soloDigitos = input.termino.replace(/\D/g, "");

      const coincide = (evento: ClientEvent) => {
        // El código se compara sin guiones ni espacios, así que da lo mismo si
        // lo copian con el doble guión que salía antes o lo escriben a mano.
        const codigo = normalizarBusqueda(evento.bookingCode ?? "").replace(/[\s-]/g, "");
        const terminoCodigo = termino.replace(/[\s-]/g, "");
        if (codigo && terminoCodigo.length >= 4 && codigo.includes(terminoCodigo)) return true;
        if (normalizarBusqueda(evento.clientName ?? "").includes(termino)) return true;
        if (normalizarBusqueda(evento.clientEmail ?? "").includes(termino)) return true;
        if (
          soloDigitos.length >= 6 &&
          (normalizeClientPhone(evento.clientPhone) ?? "").includes(soloDigitos)
        ) return true;
        return false;
      };

      const porFecha = (a: ClientEvent, b: ClientEvent) =>
        a.date < b.date ? 1 : a.date > b.date ? -1 : 0;

      let encontrados = eventos.filter(coincide);
      // Los parecidos son la segunda pasada, no la primera: si el término
      // calza exacto con alguien, esos son LOS resultados y no se ensucian
      // con homónimos aproximados. Recién cuando no hay nada se busca por
      // parecido, que es cuando el nombre venía mal escrito.
      let aproximada = false;
      if (!encontrados.length) {
        encontrados = eventos.filter(
          evento =>
            pareceA(input.termino, evento.clientName ?? "") ||
            pareceA(input.termino, evento.clientEmail ?? "")
        );
        aproximada = encontrados.length > 0;
      }
      encontrados.sort(porFecha);
      return {
        total: encontrados.length,
        aproximada,
        // Tope para no devolver media base si alguien busca "a".
        resultados: encontrados.slice(0, 50),
        sinPermisos: false,
      };
    }),

  detail: protectedProcedure
    .input(z.object({ kind: eventKindSchema, entityId: z.number().int().positive(), date: dateSchema }))
    .query(async ({ ctx, input }) => {
      const db = await database();
      const allowed = calendarServices(ctx.user);

      if (input.kind === "biopool") {
        if (!allowed.includes("biopools")) throw new TRPCError({ code: "FORBIDDEN" });
        const [row] = await db
          .select({ booking: biopoolBookings, serviceName: biopoolServices.name })
          .from(biopoolBookings)
          .innerJoin(biopoolServices, eq(biopoolBookings.serviceId, biopoolServices.id))
          .where(eq(biopoolBookings.id, input.entityId))
          .limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        const [activity, notifications, paymentRows, tickets, [checkout]] = await Promise.all([
          db.select().from(biopoolBookingActivity)
            .where(eq(biopoolBookingActivity.bookingId, input.entityId)),
          db.select().from(biopoolNotifications)
            .where(eq(biopoolNotifications.bookingId, input.entityId)),
          db.select().from(reservationPayments)
            .where(and(
              eq(reservationPayments.module, "biopools"),
              eq(reservationPayments.reservationId, input.entityId),
            )),
          db.select().from(biopoolTicketTypes)
            .where(and(
              eq(biopoolTicketTypes.serviceId, row.booking.serviceId),
              eq(biopoolTicketTypes.active, 1),
            )),
          db.select().from(biopoolCheckoutOrders)
            .where(eq(biopoolCheckoutOrders.bookingId, input.entityId))
            .limit(1),
        ]);
        const booking = row.booking;
        return {
          service: "biopools" as const,
          canManagePayments: hasCmsPermission(ctx.user, "biopools.manage_agenda"),
          canManageReservation: hasCmsPermission(ctx.user, "biopools.manage_agenda"),
          title: row.serviceName,
          editable: {
            serviceId: booking.serviceId,
            adultQuantity: booking.adultQuantity,
            childQuantity: booking.childQuantity,
            adultPriceClp: tickets.find(ticket => ticket.code === "adult")?.priceClp ?? 0,
            childPriceClp: tickets.find(ticket => ticket.code === "child")?.priceClp ?? 0,
          },
          client: { name: booking.clientName, email: booking.clientEmail, phone: booking.clientPhone },
          schedule: { date: serializeDate(booking.bookingDate), startTime: booking.startTime, endTime: booking.endTime },
          status: booking.status,
          payment: buildPaymentDetail({
            status: booking.paymentStatus,
            method: booking.paymentMethod,
            reference: booking.paymentReference,
            originalAmountClp: booking.originalAmountClp,
            discountAmountClp: booking.discountAmountClp,
            discountCode: booking.discountCode,
            amountPaidClp: booking.amountPaidClp,
            refundAmountClp: booking.refundAmountClp,
            createdAt: booking.createdAt,
            rows: paymentRows,
            legacyMethod: checkout?.authorizationCode ? "webpay_plus" : booking.paymentMethod,
            legacyReference: checkout?.authorizationCode ?? checkout?.buyOrder ?? booking.paymentReference,
            legacyPaidAt: checkout?.paidAt ?? booking.createdAt,
            historicalDiscountCode: checkout?.discountCode,
            historicalDiscountAmountClp: checkout?.discountClp,
          }),
          notes: booking.notes,
          detail: `${booking.adultQuantity} adulto(s) · ${booking.childQuantity} niño(s) · ${booking.totalGuests} personas`,
          activity: [
            ...activity.map(item => {
              const presentation = biopoolActivityPresentation(
                item.action,
                item.detail
              );
              return {
                id: `activity:${item.id}`,
                type: "activity",
                label: presentation.label,
                detail: presentation.detail,
                at: item.createdAt,
              };
            }),
            ...notifications.map(item => ({
              id: `notification:${item.id}`,
              type: "notification",
              label: `${item.type} por ${item.channel}`,
              detail: item.status,
              at: item.sentAt ?? item.scheduledAt ?? item.createdAt,
            })),
          ].sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime()),
          href: `/cms/biopiscinas/agenda?date=${serializeDate(booking.bookingDate)}`,
        };
      }

      if (input.kind === "massage" || input.kind === "massage_program") {
        if (!allowed.includes("massages")) throw new TRPCError({ code: "FORBIDDEN" });
        if (input.kind === "massage") {
          const [row] = await db
            .select({
              booking: massageBookings,
              techniqueName: massageTechniques.name,
              therapistName: massageTherapists.name,
              roomName: massageRooms.name,
            })
            .from(massageBookings)
            .leftJoin(massageTechniques, eq(massageBookings.techniqueId, massageTechniques.id))
            .leftJoin(massageTherapists, eq(massageBookings.therapistId, massageTherapists.id))
            .leftJoin(massageRooms, eq(massageBookings.roomId, massageRooms.id))
            .where(eq(massageBookings.id, input.entityId))
            .limit(1);
          if (!row) throw new TRPCError({ code: "NOT_FOUND" });
          const [[nps], paymentRows] = await Promise.all([
            db.select().from(massageNpsResponses)
              .where(and(
                eq(massageNpsResponses.bookingType, "massage"),
                eq(massageNpsResponses.bookingId, input.entityId),
              )).limit(1),
            db.select().from(reservationPayments)
              .where(and(
                eq(reservationPayments.module, "massages"),
                eq(reservationPayments.reservationId, input.entityId),
              )),
          ]);
          const booking = row.booking;
          return {
            service: "massages" as const,
            canManagePayments: hasMassagePaymentAccess(ctx.user),
            canManageReservation: hasCmsPermission(ctx.user, "massages.manage_agenda"),
            title: row.techniqueName ?? "Masaje",
            editable: {
              techniqueId: booking.techniqueId,
              duration: booking.duration,
            },
            client: { name: booking.clientName, email: booking.clientEmail, phone: booking.clientPhone },
            schedule: { date: serializeDate(booking.bookingDate), startTime: booking.startTime, endTime: booking.endTime },
            status: booking.status,
            payment: buildPaymentDetail({
              status: booking.paymentStatus,
              method: booking.manualPaymentMethod ?? (booking.getnetRequestId ? "getnet" : null),
              reference: booking.getnetRequestId,
              originalAmountClp: booking.originalAmount,
              discountAmountClp: booking.discountAmount,
              discountCode: booking.discountCode,
              amountPaidClp: booking.amountPaid,
              refundAmountClp: booking.paymentStatus === "refunded" ? money(booking.amountPaid) : 0,
              createdAt: booking.createdAt,
              rows: paymentRows,
            }),
            notes: booking.notes,
            detail: [row.therapistName, row.roomName, `${booking.duration} min`].filter(Boolean).join(" · "),
            activity: [
              { id: `created:${booking.id}`, type: "activity", label: "Reserva creada", detail: booking.bookingSource, at: booking.createdAt },
              ...noteRescheduleActivities(booking.notes, `massage:${booking.id}`),
              ...(booking.cancelledAt ? [{ id: `cancelled:${booking.id}`, type: "activity", label: "Reserva cancelada", detail: booking.cancellationReason, at: booking.cancelledAt }] : []),
              ...(nps?.respondedAt ? [{ id: `nps:${nps.id}`, type: "nps", label: `NPS ${nps.score}/10`, detail: nps.comment, at: nps.respondedAt }] : []),
            ].sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime()),
            href: `/cms/masajes/agenda?date=${serializeDate(booking.bookingDate)}`,
          };
        }

        const [booking] = await db.select().from(massageProgramBookings)
          .where(eq(massageProgramBookings.id, input.entityId)).limit(1);
        if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
        const [[nps], paymentRows] = await Promise.all([
          db.select().from(massageNpsResponses)
            .where(and(
              eq(massageNpsResponses.bookingType, "skedu_program"),
              eq(massageNpsResponses.bookingId, input.entityId),
            )).limit(1),
          db.select().from(reservationPayments)
            .where(and(
              eq(reservationPayments.module, "massage_programs"),
              eq(reservationPayments.reservationId, input.entityId),
            )),
        ]);
        const programPayment = massageProgramPaymentState(booking, paymentRows);
        return {
          service: "massages" as const,
          canManagePayments: hasMassagePaymentAccess(ctx.user),
          canManageReservation: false,
          title: `Programa ${booking.program.replaceAll("_", " ")}`,
          client: { name: booking.clientName, email: booking.clientEmail, phone: booking.clientPhone },
          schedule: { date: serializeDate(booking.bookingDate), startTime: booking.startTime, endTime: booking.endTime },
          status: booking.status,
          payment: buildPaymentDetail({
            status: programPayment.status,
            method: booking.paymentMethod,
            reference: booking.paymentReference,
            originalAmountClp: programPayment.totalClp,
            amountPaidClp: programPayment.paidClp,
            refundAmountClp: 0,
            createdAt: booking.createdAt,
            rows: paymentRows,
          }),
          notes: booking.notes,
          detail: `${booking.modality === "double" ? "Doble" : "Simple"} · ${booking.duration} min`,
          activity: [
            { id: `created:${booking.id}`, type: "activity", label: "Programa ingresado", detail: booking.externalReference, at: booking.createdAt },
            ...(booking.cancelledAt ? [{ id: `cancelled:${booking.id}`, type: "activity", label: "Reserva cancelada", detail: booking.cancellationReason, at: booking.cancelledAt }] : []),
            ...(nps?.respondedAt ? [{ id: `nps:${nps.id}`, type: "nps", label: `NPS ${nps.score}/10`, detail: nps.comment, at: nps.respondedAt }] : []),
          ].sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime()),
          href: `/cms/masajes/agenda?date=${serializeDate(booking.bookingDate)}`,
        };
      }

      if (input.kind === "sauna") {
        if (!allowed.includes("sauna")) throw new TRPCError({ code: "FORBIDDEN" });
        const [[booking], paymentRows, [checkout]] = await Promise.all([
          db.select()
            .from(saunaBookings)
            .where(eq(saunaBookings.id, input.entityId))
            .limit(1),
          db.select().from(reservationPayments)
            .where(and(
              eq(reservationPayments.module, "sauna"),
              eq(reservationPayments.reservationId, input.entityId),
            )),
          db.select().from(saunaCheckoutOrders)
            .where(eq(saunaCheckoutOrders.bookingId, input.entityId))
            .limit(1),
        ]);
        if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
        return {
          service: "sauna" as const,
          canManagePayments: hasCmsPermission(ctx.user, "sauna.manage_agenda"),
          canManageReservation:
            booking.source !== "skedu" &&
            hasCmsPermission(ctx.user, "sauna.manage_agenda"),
          title: booking.serviceName,
          client: {
            name: booking.clientName ?? "Sin cliente registrado",
            email: booking.clientEmail,
            phone: booking.clientPhone,
          },
          schedule: {
            date: serializeDate(booking.bookingDate),
            startTime: booking.startTime,
            endTime: booking.endTime,
          },
          status: booking.status,
          payment: buildPaymentDetail({
            status: booking.paymentStatus,
            method: booking.paymentMethod,
            reference: booking.paymentReference,
            originalAmountClp: booking.amountClp,
            amountPaidClp: booking.amountPaidClp,
            refundAmountClp: booking.paymentStatus === "refunded" ? booking.amountPaidClp : 0,
            createdAt: booking.createdAt,
            rows: paymentRows,
            legacyMethod: checkout?.authorizationCode ? "webpay_plus" : booking.paymentMethod,
            legacyReference: checkout?.authorizationCode ?? checkout?.buyOrder ?? booking.paymentReference,
            legacyPaidAt: checkout?.paidAt ?? booking.createdAt,
          }),
          notes: booking.notes,
          detail: `${booking.guests} persona(s) · ${booking.source === "skedu" ? "Skedu" : "CMS"}`,
          activity: [
            {
              id: `created:${booking.id}`,
              type: "activity",
              label: "Reserva creada",
              detail: booking.origin,
              at: booking.createdAt,
            },
            ...noteRescheduleActivities(booking.notes, `sauna:${booking.id}`),
            ...(booking.cancelledAt
              ? [{
                  id: `cancelled:${booking.id}`,
                  type: "activity",
                  label: "Reserva cancelada",
                  detail: null,
                  at: booking.cancelledAt,
                }]
              : []),
          ].sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime()),
          href: `/cms/sauna/agenda?date=${serializeDate(booking.bookingDate)}`,
        };
      }

      if (!allowed.includes("regular_classes")) throw new TRPCError({ code: "FORBIDDEN" });
      if (input.kind === "regular_class_membership") {
        const [row] = await db.select({
          membership: regularClassMemberships,
          student: regularClassStudents,
          planName: regularClassPlans.name,
        }).from(regularClassMemberships)
          .innerJoin(regularClassStudents, eq(regularClassMemberships.studentId, regularClassStudents.id))
          .innerJoin(regularClassPlans, eq(regularClassMemberships.planId, regularClassPlans.id))
          .where(eq(regularClassMemberships.id, input.entityId)).limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        const name = [row.student.firstName, row.student.lastName].filter(Boolean).join(" ");
        const totalAmountClp = Math.max(
          0,
          row.membership.originalAmountClp - row.membership.discountAmountClp
        );
        return {
          service: "regular_classes" as const,
          canManagePayments: false,
          canManageReservation: false,
          title: row.planName,
          client: { name, email: row.student.email, phone: row.student.phone },
          schedule: {
            date: serializeDate(row.membership.periodStart),
            startTime: "",
            endTime: "",
          },
          status: row.membership.status,
          payment: buildPaymentDetail({
            status: row.membership.paymentStatus,
            method: row.membership.paymentMethod,
            reference: row.membership.paymentReference,
            originalAmountClp: row.membership.originalAmountClp,
            discountAmountClp: row.membership.discountAmountClp,
            discountCode: row.membership.discountCode,
            amountPaidClp: row.membership.paymentStatus === "paid"
              ? row.membership.pricePaidClp
              : 0,
            createdAt: row.membership.createdAt,
          }),
          notes: row.membership.notes,
          detail: `Vigencia ${serializeDate(row.membership.periodStart)}–${serializeDate(row.membership.periodEnd)}`,
          activity: [{
            id: `created:${row.membership.id}`,
            type: "activity" as const,
            label: "Plan registrado",
            detail: row.planName,
            at: row.membership.createdAt,
          }],
          href: "/cms/clases-regulares/alumnos",
        };
      }
      if (input.kind === "regular_class") {
        const [row] = await db.select({
          session: regularClassSessions,
          disciplineName: regularClassDisciplines.name,
          teacherName: regularClassTeachers.name,
        }).from(regularClassSessions)
          .innerJoin(regularClassDisciplines, eq(regularClassSessions.disciplineId, regularClassDisciplines.id))
          .innerJoin(regularClassTeachers, eq(regularClassSessions.teacherId, regularClassTeachers.id))
          .where(eq(regularClassSessions.id, input.entityId)).limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        const attendances = await db.select().from(regularClassAttendances)
          .where(eq(regularClassAttendances.sessionId, input.entityId));
        return {
          service: "regular_classes" as const,
          canManagePayments: false,
          title: row.disciplineName,
          client: { name: row.teacherName, email: null, phone: null },
          schedule: { date: serializeDate(row.session.sessionDate), startTime: row.session.startTime, endTime: row.session.endTime },
          status: row.session.status,
          payment: null,
          notes: row.session.notes,
          detail: `${attendances.filter(item => item.status === "present").length} asistente(s)`,
          activity: [{ id: `created:${row.session.id}`, type: "activity", label: "Clase programada", detail: row.teacherName, at: row.session.createdAt }],
          href: `/cms/clases-regulares/asistencia?date=${serializeDate(row.session.sessionDate)}`,
        };
      }

      const [row] = await db.select({
        schedule: regularClassSchedules,
        disciplineName: regularClassDisciplines.name,
        teacherName: regularClassTeachers.name,
      }).from(regularClassSchedules)
        .innerJoin(regularClassDisciplines, eq(regularClassSchedules.disciplineId, regularClassDisciplines.id))
        .innerJoin(regularClassTeachers, eq(regularClassSchedules.teacherId, regularClassTeachers.id))
        .where(eq(regularClassSchedules.id, input.entityId)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        service: "regular_classes" as const,
        canManagePayments: false,
        title: row.disciplineName,
        client: { name: row.teacherName, email: null, phone: null },
        schedule: { date: input.date, startTime: row.schedule.startTime, endTime: row.schedule.endTime },
        status: "scheduled",
        payment: null,
        notes: null,
        detail: "Clase recurrente",
        activity: [],
        href: `/cms/clases-regulares/asistencia?date=${input.date}`,
      };
    }),

  materializeLegacyPayment: protectedProcedure
    .input(z.object({
      service: z.enum(["massages", "biopools", "sauna"]),
      entityId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await database();
      const allowed = calendarServices(ctx.user);
      if (!allowed.includes(input.service)) throw new TRPCError({ code: "FORBIDDEN" });
      const canManage = input.service === "massages"
        ? hasMassagePaymentAccess(ctx.user)
        : hasCmsPermission(ctx.user, `${input.service}.manage_agenda` as any);
      if (!canManage) throw new TRPCError({ code: "FORBIDDEN" });

      return db.transaction(async tx => {
        const existing = await tx.select().from(reservationPayments).where(and(
          eq(reservationPayments.module, input.service),
          eq(reservationPayments.reservationId, input.entityId),
        ));
        if (existing.length)
          throw new TRPCError({ code: "CONFLICT", message: "El pago ya fue convertido a detalle. Actualiza la reserva." });

        let method: string | null = null;
        let reference: string | null = null;
        let amountClp = 0;
        let createdAt: Date | null = null;
        if (input.service === "massages") {
          const [booking] = await tx.select().from(massageBookings)
            .where(eq(massageBookings.id, input.entityId)).limit(1);
          if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
          if (booking.getnetRequestId)
            throw new TRPCError({ code: "BAD_REQUEST", message: "Los pagos Getnet están protegidos" });
          method = booking.manualPaymentMethod;
          amountClp = money(booking.amountPaid);
          createdAt = booking.createdAt;
        } else if (input.service === "biopools") {
          const [booking] = await tx.select().from(biopoolBookings)
            .where(eq(biopoolBookings.id, input.entityId)).limit(1);
          if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
          method = booking.paymentMethod;
          reference = booking.paymentReference;
          amountClp = booking.amountPaidClp;
          createdAt = booking.createdAt;
        } else {
          const [booking] = await tx.select().from(saunaBookings)
            .where(eq(saunaBookings.id, input.entityId)).limit(1);
          if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
          method = booking.paymentMethod;
          reference = booking.paymentReference;
          amountClp = booking.amountPaidClp;
          createdAt = booking.createdAt;
        }
        if (!method || amountClp <= 0)
          throw new TRPCError({ code: "BAD_REQUEST", message: "No existe un pago manual para editar" });
        if (["webpay", "webpay_plus", "getnet"].includes(method))
          throw new TRPCError({ code: "BAD_REQUEST", message: "Los pagos electrónicos están protegidos" });
        if (method === "gift_card")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Esta Gift Card histórica no tiene trazabilidad suficiente para editarla de forma segura",
          });
        const [created] = await tx.insert(reservationPayments).values({
          module: input.service,
          reservationId: input.entityId,
          method,
          status: "paid",
          amountClp,
          paidAt: createdAt,
          reference,
          createdByUserId: ctx.user.id,
        }).$returningId();
        return { paymentId: created.id };
      });
    }),

  replaceGiftCardPayment: protectedProcedure
    .input(z.object({
      service: z.enum(["massages", "biopools", "sauna"]),
      paymentId: z.number().int().positive(),
      code: z.string().trim().min(1).max(20),
      amountClp: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await database();
      const canManage = input.service === "massages"
        ? hasMassagePaymentAccess(ctx.user)
        : hasCmsPermission(ctx.user, `${input.service}.manage_agenda` as any);
      if (!canManage) throw new TRPCError({ code: "FORBIDDEN" });
      const result = await db.transaction(async tx => {
        const [payment] = await tx.select().from(reservationPayments).where(and(
          eq(reservationPayments.id, input.paymentId),
          eq(reservationPayments.module, input.service),
        )).limit(1);
        if (!payment?.giftCardId || payment.method !== "gift_card")
          throw new TRPCError({ code: "BAD_REQUEST", message: "El pago no corresponde a una Gift Card editable" });
        await assertNoLiveReservationPaymentAttempt(tx, input.service, payment.reservationId);

        let totalClp = 0;
        let currentPaidClp = 0;
        if (input.service === "massages") {
          const [booking] = await tx.select().from(massageBookings)
            .where(eq(massageBookings.id, payment.reservationId)).limit(1);
          if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
          totalClp = Math.max(0, money(booking.originalAmount) - money(booking.discountAmount));
          currentPaidClp = money(booking.amountPaid);
        } else if (input.service === "biopools") {
          const [booking] = await tx.select().from(biopoolBookings)
            .where(eq(biopoolBookings.id, payment.reservationId)).limit(1);
          if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
          totalClp = Math.max(0, booking.originalAmountClp - booking.discountAmountClp);
          currentPaidClp = booking.amountPaidClp;
        } else {
          const [booking] = await tx.select().from(saunaBookings)
            .where(eq(saunaBookings.id, payment.reservationId)).limit(1);
          if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
          totalClp = booking.amountClp;
          currentPaidClp = booking.amountPaidClp;
        }
        const newPaidClp = Math.max(0, currentPaidClp - payment.amountClp) + input.amountClp;
        if (newPaidClp > totalClp)
          throw new TRPCError({ code: "BAD_REQUEST", message: "El canje supera el saldo pendiente de la reserva" });

        const [oldCard] = await tx.select().from(giftCards)
          .where(eq(giftCards.id, payment.giftCardId)).limit(1);
        if (!oldCard) throw new TRPCError({ code: "NOT_FOUND", message: "Gift Card anterior no encontrada" });
        const restoredBalance = oldCard.amount === 0
          ? 0
          : Math.min(oldCard.amount, oldCard.balance + payment.amountClp);
        await tx.update(giftCards).set({
          balance: restoredBalance,
          status: "active",
          redeemedAt: null,
        }).where(eq(giftCards.id, oldCard.id));
        await tx.insert(giftCardTransactions).values({
          giftCardId: oldCard.id,
          transactionType: "refund",
          amount: payment.amountClp,
          balanceBefore: oldCard.balance,
          balanceAfter: restoredBalance,
          orderType: `${input.service}_booking`,
          orderId: String(payment.reservationId),
          notes: `Gift Card reemplazada desde Calendario 360 por ${ctx.user.name || ctx.user.email || "usuario"}`,
        });
        const redeemed = await redeemGiftCardPayment({
          tx,
          payment: {
            method: "gift_card",
            status: "paid",
            amountClp: input.amountClp,
            paidAt: new Date().toISOString().slice(0, 16),
            giftCardCode: input.code.trim().toUpperCase(),
          },
          totalClp,
          module: input.service,
          reservationId: payment.reservationId,
          note: `Gift Card editada desde Calendario 360`,
          serviceKey: input.service,
        });
        await tx.update(reservationPayments).set({
          amountClp: input.amountClp,
          reference: redeemed.code,
          giftCardId: redeemed.id,
          paidAt: new Date(),
        }).where(eq(reservationPayments.id, payment.id));
        const status = newPaidClp <= 0 ? "pending" : newPaidClp < totalClp ? "partially_paid" : "paid";
        if (input.service === "massages") {
          await tx.update(massageBookings).set({ amountPaid: String(newPaidClp), paymentStatus: status })
            .where(eq(massageBookings.id, payment.reservationId));
        } else if (input.service === "biopools") {
          await tx.update(biopoolBookings).set({ amountPaidClp: newPaidClp, paymentStatus: status })
            .where(eq(biopoolBookings.id, payment.reservationId));
        } else {
          await tx.update(saunaBookings).set({ amountPaidClp: newPaidClp, paymentStatus: status })
            .where(eq(saunaBookings.id, payment.reservationId));
        }
        return { success: true, reservationId: payment.reservationId };
      });
      if (input.service === "massages") await syncMassageSale(result.reservationId);
      return { success: true };
    }),

  clients: router({
    list: protectedProcedure
      .input(
        z.object({
          search: z.string().trim().max(100).optional(),
          service: serviceSchema.optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        return clientListData(ctx.user, input);
      }),

    listPage: protectedProcedure
      .input(z.object({
        search: z.string().trim().max(100).optional(),
        service: serviceSchema.optional(),
        cursor: z.number().int().nonnegative().default(0),
        limit: z.number().int().min(1).max(100).default(30),
      }))
      .query(async ({ ctx, input }) => {
        const clients = await clientListData(ctx.user, input);
        const items = clients.slice(input.cursor, input.cursor + input.limit);
        const nextCursor = input.cursor + items.length < clients.length
          ? input.cursor + items.length
          : null;
        return {
          items,
          total: clients.length,
          nextCursor,
          summary: {
            clients: clients.length,
            upcomingReservations: clients.reduce((sum, client) => sum + client.upcomingReservations, 0),
            pendingBalanceClp: clients.reduce((sum, client) => sum + client.pendingBalanceClp, 0),
          },
        };
      }),

    history: protectedProcedure
      .input(z.object({
        clientKey: z.string().min(3).optional(),
        profileId: z.number().int().positive().optional(),
        service: serviceSchema.optional(),
      }).refine(value => Boolean(value.clientKey || value.profileId), {
        message: "Debes indicar la ficha del cliente",
      }))
      .query(async ({ ctx, input }) => {
        const profileId = await resolveClientProfileId(input);
        await assertClientProfileVisible(ctx.user, profileId);
        const events = await loadClientEvents(ctx.user);
        return events
          .filter(event => event.profileId === profileId)
          .filter(event => !input.service || event.service === input.service)
          .sort((a, b) => `${b.date} ${b.startTime ?? ""}`.localeCompare(`${a.date} ${a.startTime ?? ""}`))
          .map(event => clientEventResponse(event, ctx.user));
      }),

    historyPage: protectedProcedure
      .input(z.object({
        profileId: z.number().int().positive(),
        service: serviceSchema.optional(),
        activityBucket: z.enum(["upcoming", "past", "cancelled"]).optional(),
        cursor: z.number().int().nonnegative().default(0),
        limit: z.number().int().min(1).max(100).default(30),
      }))
      .query(async ({ ctx, input }) => {
        await assertClientProfileVisible(ctx.user, input.profileId);
        const events = (await loadClientEvents(ctx.user))
          .filter(event => event.profileId === input.profileId)
          .filter(event => !input.service || event.service === input.service)
          .map(event => clientEventResponse(event, ctx.user))
          .filter(event => !input.activityBucket || event.activityBucket === input.activityBucket)
          .sort((a, b) => `${b.date} ${b.startTime ?? ""}`.localeCompare(`${a.date} ${a.startTime ?? ""}`));
        const items = events.slice(input.cursor, input.cursor + input.limit);
        return {
          items,
          total: events.length,
          nextCursor: input.cursor + items.length < events.length
            ? input.cursor + items.length
            : null,
        };
      }),

    profile: protectedProcedure
      .input(z.object({ profileId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const profile = await assertClientProfileVisible(ctx.user, input.profileId);
        const db = await database();
        const [identities, auditRows, allGiftCards, summaries, events] = await Promise.all([
          db.select().from(client360Identities)
            .where(eq(client360Identities.profileId, input.profileId)),
          db.select().from(client360Audit)
            .where(eq(client360Audit.profileId, input.profileId)),
          db.select().from(giftCards),
          clientListData(ctx.user, {}),
          loadClientEvents(ctx.user),
        ]);
        const identityKeys = new Set(identities.map(identity => identity.identityKey));
        const clientGiftCards = allGiftCards
          .filter(card => {
            const email = normalizeClientEmail(card.recipientEmail);
            const phone = normalizeClientPhone(card.recipientPhone);
            return Boolean(
              (email && identityKeys.has(`email:${email}`)) ||
              (phone && identityKeys.has(`phone:${phone}`))
            );
          })
          .map(card => ({
            id: card.id,
            code: card.code,
            amountClp: card.amount,
            balanceClp: card.balance,
            status: card.status,
            redemptionMode: card.redemptionMode,
            serviceKey: card.serviceKey,
            serviceName: card.serviceName,
            expiresAt: card.expiresAt,
          }));
        const profileEvents = events.filter(event => event.profileId === input.profileId);
        return {
          profile: {
            id: profile.id,
            key: `profile:${profile.id}`,
            name: profile.displayName,
            email: profile.primaryEmail,
            phone: profile.primaryPhone,
            notes: profile.notes,
            status: profile.status,
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt,
          },
          aliases: identities
            .filter(identity => identity.kind !== "external")
            .map(identity => ({
              id: identity.id,
              kind: identity.kind,
              value: identity.displayValue ?? identity.normalizedValue,
              normalizedValue: identity.normalizedValue,
              source: identity.source,
            })),
          summary: summaries.find(item => item.profileId === input.profileId) ?? {
            reservations: profileEvents.length,
            upcomingReservations: profileEvents.filter(event => clientEventActivity(event) === "upcoming").length,
            totalSpentClp: profileEvents.reduce((sum, event) => sum + event.amountClp, 0),
            pendingBalanceClp: profileEvents.reduce((sum, event) => sum + event.balanceAmountClp, 0),
            nextReservation: null,
            services: Array.from(new Set(profileEvents.map(event => event.service))),
            lastActivity: serializeDate(profile.updatedAt),
          },
          giftCards: clientGiftCards,
          activity: auditRows
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, 100),
          canManageProfile: canManageClientProfiles(ctx.user),
          canMergeProfiles: isAdminRole(ctx.user.role),
        };
      }),

    updateProfile: protectedProcedure
      .input(z.object({
        profileId: z.number().int().positive(),
        name: z.string().trim().min(1).max(200).optional(),
        email: z.string().trim().email().max(320).nullable().optional(),
        phone: z.string().trim().max(40).nullable().optional(),
        notes: z.string().trim().max(5_000).nullable().optional(),
      }).refine(value =>
        value.name !== undefined ||
        value.email !== undefined ||
        value.phone !== undefined ||
        value.notes !== undefined,
      { message: "No hay cambios para guardar" }))
      .mutation(async ({ ctx, input }) => {
        assertClientProfileManageAccess(ctx.user);
        const current = await assertClientProfileVisible(ctx.user, input.profileId);
        if (current.status !== "active") {
          throw new TRPCError({ code: "CONFLICT", message: "La ficha fue fusionada" });
        }
        const db = await database();
        const updates: Partial<typeof client360Profiles.$inferInsert> = {
          updatedByUserId: ctx.user.id,
        };
        if (input.name !== undefined) updates.displayName = input.name;
        if (input.email !== undefined) updates.primaryEmail = normalizeClientEmail(input.email);
        if (input.phone !== undefined) updates.primaryPhone = input.phone?.trim() || null;
        if (input.notes !== undefined) updates.notes = input.notes || null;
        await db.transaction(async tx => {
          await tx.update(client360Profiles).set(updates)
            .where(eq(client360Profiles.id, input.profileId));
          const identityValues = [
            input.email
              ? {
                  profileId: input.profileId,
                  kind: "email" as const,
                  identityKey: `email:${normalizeClientEmail(input.email)}`,
                  normalizedValue: normalizeClientEmail(input.email)!,
                  displayValue: input.email,
                  source: "profile_edit",
                }
              : null,
            input.phone && normalizeClientPhone(input.phone)
              ? {
                  profileId: input.profileId,
                  kind: "phone" as const,
                  identityKey: `phone:${normalizeClientPhone(input.phone)}`,
                  normalizedValue: normalizeClientPhone(input.phone)!,
                  displayValue: input.phone,
                  source: "profile_edit",
                }
              : null,
          ].filter((value): value is NonNullable<typeof value> => Boolean(value));
          for (const identity of identityValues) {
            await tx.insert(client360Identities).values(identity)
              .onDuplicateKeyUpdate({ set: { displayValue: identity.displayValue, source: "profile_edit" } });
          }
          await tx.insert(client360Audit).values({
            profileId: input.profileId,
            action: "profile_updated",
            actorUserId: ctx.user.id,
            detail: JSON.stringify({
              before: {
                name: current.displayName,
                email: current.primaryEmail,
                phone: current.primaryPhone,
                notes: current.notes,
              },
              after: input,
            }),
          });
        });
        return { success: true, profileId: input.profileId };
      }),

    linkReservations: protectedProcedure
      .input(z.object({
        profileId: z.number().int().positive(),
        reservations: z.array(clientReservationReferenceSchema).min(1).max(20),
      }))
      .mutation(async ({ ctx, input }) => {
        assertClientProfileManageAccess(ctx.user);
        const profile = await assertClientProfileVisible(ctx.user, input.profileId);
        if (profile.status !== "active") {
          throw new TRPCError({ code: "CONFLICT", message: "La ficha fue fusionada" });
        }
        const references = input.reservations.map(normalizeReservationReference);
        for (const reference of references) assertCanLinkReservation(ctx.user, reference.kind);
        const db = await database();
        let linked = 0;
        await db.transaction(async tx => {
          for (const reference of references) {
            if (!(await reservationReferenceExists(tx as any, reference))) {
              throw new TRPCError({ code: "NOT_FOUND", message: "Reserva no encontrada" });
            }
            const sourceKey = `${reference.kind}:${reference.entityId}`;
            const [existing] = await tx.select().from(client360ReservationLinks)
              .where(eq(client360ReservationLinks.sourceKey, sourceKey)).limit(1);
            if (existing && existing.profileId !== input.profileId) {
              if (existing.linkedBy !== "automatic") {
                throw new TRPCError({
                  code: "CONFLICT",
                  message: "La reserva ya pertenece a otra ficha; fusiona las fichas para continuar",
                });
              }
              await tx.update(client360ReservationLinks).set({
                profileId: input.profileId,
                linkedBy: "manual",
                createdByUserId: ctx.user.id,
              }).where(eq(client360ReservationLinks.id, existing.id));
              await tx.insert(client360Audit).values([
                {
                  profileId: input.profileId,
                  relatedProfileId: existing.profileId,
                  action: "automatic_reservation_link_corrected",
                  actorUserId: ctx.user.id,
                  detail: JSON.stringify({ sourceKey }),
                },
                {
                  profileId: existing.profileId,
                  relatedProfileId: input.profileId,
                  action: "automatic_reservation_link_moved",
                  actorUserId: ctx.user.id,
                  detail: JSON.stringify({ sourceKey }),
                },
              ]);
              linked += 1;
              continue;
            }
            if (existing) continue;
            await tx.insert(client360ReservationLinks).values({
              profileId: input.profileId,
              reservationKind: reference.kind,
              reservationId: reference.entityId,
              sourceKey,
              linkedBy: "manual",
              createdByUserId: ctx.user.id,
            });
            await tx.insert(client360Audit).values({
              profileId: input.profileId,
              action: "reservation_linked_manually",
              actorUserId: ctx.user.id,
              detail: JSON.stringify({ sourceKey }),
            });
            linked += 1;
          }
        });
        return { success: true, linked };
      }),

    syncSkeduHistory: protectedProcedure
      .input(z.object({ from: dateSchema, to: dateSchema }))
      .mutation(async ({ ctx, input }) => {
        assertClientProfileAccess(ctx.user);
        if (!isAdminRole(ctx.user.role)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Solo administración puede importar el historial de Skedu",
          });
        }
        const rangeDays = Math.floor(
          (new Date(`${input.to}T12:00:00Z`).getTime() -
            new Date(`${input.from}T12:00:00Z`).getTime()) /
            86_400_000
        );
        if (rangeDays < 0 || rangeDays > 366) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "El rango de importación debe ser de hasta 366 días",
          });
        }

        // Asegura primero los enlaces de las reservas locales para no duplicar
        // programas o Sauna que ya fueron sincronizados desde Skedu.
        await loadClientEvents(ctx.user);
        const fetched = await getAllSkeduAppointments({
          startDate: santiagoLocalMidnightUtc(input.from),
          endDate: santiagoLocalMidnightUtc(nextDate(input.to)),
        });
        const uniqueFetched = deduplicateSkeduAppointments(fetched);
        const appointments = uniqueFetched.filter(appointment => {
          const local = skeduLocalDateTime(appointment.StartsAt);
          return local && local.date >= input.from && local.date <= input.to;
        });
        const db = await database();
        const [
          profiles,
          identities,
          links,
          existingExternalRows,
          programRows,
          saunaRows,
          saunaQueueRows,
        ] = await Promise.all([
          db.select().from(client360Profiles),
          db.select().from(client360Identities),
          db.select().from(client360ReservationLinks),
          db.select().from(client360ExternalEvents),
          db.select({ id: massageProgramBookings.id, externalReference: massageProgramBookings.externalReference })
            .from(massageProgramBookings),
          db.select({ id: saunaBookings.id, appointmentUuid: saunaBookings.skeduAppointmentUuid })
            .from(saunaBookings),
          db.select({ id: saunaProgramQueue.id, appointmentUuid: saunaProgramQueue.skeduAppointmentUuid })
            .from(saunaProgramQueue),
        ]);
        const profilesById = new Map(profiles.map(profile => [profile.id, profile]));
        const profilesByOrigin = new Map(
          profiles.filter(profile => profile.originKey).map(profile => [profile.originKey!, profile.id])
        );
        const activeProfileId = (profileId: number): number => {
          let current = profileId;
          const seen = new Set<number>();
          while (!seen.has(current)) {
            seen.add(current);
            const profile = profilesById.get(current);
            if (profile?.status !== "merged" || !profile.mergedIntoProfileId) break;
            current = profile.mergedIntoProfileId;
          }
          return current;
        };
        const profileIdsByIdentity = new Map<string, Set<number>>();
        for (const identity of identities) {
          const current = profileIdsByIdentity.get(identity.identityKey) ?? new Set<number>();
          current.add(activeProfileId(identity.profileId));
          profileIdsByIdentity.set(identity.identityKey, current);
        }
        const uniqueProfileForIdentity = (key: string | null) => {
          if (!key) return null;
          const candidates = profileIdsByIdentity.get(key);
          return candidates?.size === 1 ? Array.from(candidates)[0] : null;
        };
        const profileBySource = new Map(links.map(link => [link.sourceKey, activeProfileId(link.profileId)]));
        const existingExternal = new Map(existingExternalRows.map(row => [row.externalKey, row]));
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const nativeByAppointment = new Map<string, { kind: string; id: number; sourceKey?: string }>();
        for (const row of programRows) {
          const uuid = row.externalReference?.trim();
          if (uuid && uuidPattern.test(uuid)) {
            nativeByAppointment.set(uuid, {
              kind: "massage_program",
              id: row.id,
              sourceKey: `massage_program:${row.id}`,
            });
          }
        }
        for (const row of saunaRows) {
          if (row.appointmentUuid) {
            nativeByAppointment.set(row.appointmentUuid, {
              kind: "sauna",
              id: row.id,
              sourceKey: `sauna:${row.id}`,
            });
          }
        }
        for (const row of saunaQueueRows) {
          if (row.appointmentUuid && !nativeByAppointment.has(row.appointmentUuid)) {
            nativeByAppointment.set(row.appointmentUuid, {
              kind: "sauna_program_queue",
              id: row.id,
            });
          }
        }

        // Solo descarga el directorio de usuarios de los negocios que todavía
        // tienen UUID sin identidad canónica; reintentos ya vinculados no lo necesitan.
        const businessIdsNeedingUsers = new Set<string>();
        for (const appointment of appointments) {
          const userUuid = String(appointment.UserUUID ?? "").trim();
          const businessUuid = String(appointment.BusinessUUID ?? "").trim();
          const native = nativeByAppointment.get(String(appointment.UUID ?? ""));
          const nativeProfile = native?.sourceKey ? profileBySource.get(native.sourceKey) : null;
          if (
            userUuid &&
            businessUuid &&
            !nativeProfile &&
            !uniqueProfileForIdentity(`external:skedu:${userUuid}`)
          ) {
            businessIdsNeedingUsers.add(businessUuid);
          }
        }
        const usersByUuid = new Map<string, Record<string, any>>();
        let usersRead = 0;
        let usersFailed = 0;
        for (const businessUuid of businessIdsNeedingUsers) {
          try {
            const users = await getAllSkeduBusinessUsers(businessUuid);
            usersRead += users.length;
            for (const user of users) {
              const uuid = String(user.UUID ?? "").trim();
              if (uuid) usersByUuid.set(uuid, user);
            }
          } catch {
            usersFailed += 1;
          }
        }

        const stats = {
          from: input.from,
          to: input.to,
          fetchedRows: fetched.length,
          uniqueAppointments: appointments.length,
          apiDuplicates: Math.max(0, fetched.length - uniqueFetched.length),
          inserted: 0,
          updated: 0,
          linkedToNative: 0,
          profilesCreated: 0,
          identitiesCreated: 0,
          usersRead,
          usersFailed,
          unmatched: 0,
        };
        const externalEventUpserts: Array<{
          values: typeof client360ExternalEvents.$inferInsert;
          existed: boolean;
        }> = [];

        const addIdentity = async (inputIdentity: {
          profileId: number;
          kind: "email" | "phone" | "external";
          key: string;
          normalizedValue: string;
          displayValue: string | null;
        }) => {
          const current = profileIdsByIdentity.get(inputIdentity.key) ?? new Set<number>();
          if (current.has(inputIdentity.profileId)) return;
          await db.insert(client360Identities).values({
            profileId: inputIdentity.profileId,
            kind: inputIdentity.kind,
            identityKey: inputIdentity.key,
            normalizedValue: inputIdentity.normalizedValue,
            displayValue: inputIdentity.displayValue,
            source: "skedu_history",
          }).onDuplicateKeyUpdate({ set: { displayValue: inputIdentity.displayValue } });
          current.add(inputIdentity.profileId);
          profileIdsByIdentity.set(inputIdentity.key, current);
          stats.identitiesCreated += 1;
        };

        for (const appointment of appointments) {
          const appointmentUuid = String(appointment.UUID ?? "").trim();
          const start = skeduLocalDateTime(appointment.StartsAt);
          if (!appointmentUuid || !start) continue;
          const end = skeduLocalDateTime(appointment.EndsAt);
          const externalKey = `skedu:${appointmentUuid}`;
          const previous = existingExternal.get(externalKey);
          const native = nativeByAppointment.get(appointmentUuid);
          let profileId = native?.sourceKey
            ? profileBySource.get(native.sourceKey) ?? null
            : null;
          const userUuid = String(appointment.UserUUID ?? "").trim();
          const user = usersByUuid.get(userUuid);
          const userName = [user?.FirstName, user?.LastName].filter(Boolean).join(" ").trim();
          const userEmail = String(user?.Email ?? "").trim() || null;
          const userPhone = String(user?.Phone ?? "").trim() || null;
          const email = normalizeClientEmail(userEmail);
          const phone = normalizeClientPhone(userPhone);

          if (!profileId && userUuid) {
            profileId = uniqueProfileForIdentity(`external:skedu:${userUuid}`);
          }
          if (!profileId && (email || phone)) {
            profileId = chooseClientProfileCandidate({
              emailProfileId: uniqueProfileForIdentity(email ? `email:${email}` : null),
              phoneProfileId: uniqueProfileForIdentity(phone ? `phone:${phone}` : null),
            }).profileId;
          }
          if (!profileId && userUuid) {
            const originKey = `skedu_user:${userUuid}`;
            profileId = profilesByOrigin.get(originKey) ?? null;
            if (!profileId) {
              const [created] = await db.insert(client360Profiles).values({
                originKey,
                displayName: userName || email || `Cliente Skedu ${userUuid.slice(0, 8)}`,
                primaryEmail: email,
                primaryPhone: userPhone,
              }).$returningId();
              profileId = created.id;
              profilesByOrigin.set(originKey, profileId);
              profilesById.set(profileId, {
                id: profileId,
                originKey,
                displayName: userName || email || `Cliente Skedu ${userUuid.slice(0, 8)}`,
                primaryEmail: email,
                primaryPhone: userPhone,
                notes: null,
                status: "active",
                mergedIntoProfileId: null,
                createdByUserId: ctx.user.id,
                updatedByUserId: ctx.user.id,
                createdAt: new Date(),
                updatedAt: new Date(),
              });
              stats.profilesCreated += 1;
              await db.insert(client360Audit).values({
                profileId,
                action: "profile_created_from_skedu_history",
                actorUserId: ctx.user.id,
                detail: JSON.stringify({ userUuid }),
              });
            }
          }
          if (!profileId) {
            profileId = previous?.profileId ?? null;
          }
          if (profileId && userUuid) {
            await addIdentity({
              profileId,
              kind: "external",
              key: `external:skedu:${userUuid}`,
              normalizedValue: userUuid,
              displayValue: userUuid,
            });
          }
          if (profileId && email) {
            await addIdentity({
              profileId,
              kind: "email",
              key: `email:${email}`,
              normalizedValue: email,
              displayValue: userEmail ?? email,
            });
          }
          if (profileId && phone) {
            await addIdentity({
              profileId,
              kind: "phone",
              key: `phone:${phone}`,
              normalizedValue: phone,
              displayValue: userPhone ?? phone,
            });
          }
          if (!profileId) stats.unmatched += 1;
          if (native) stats.linkedToNative += 1;

          const serviceName = String(
            appointment.Service?.Name ?? appointment.ServiceName ?? "Servicio Skedu"
          );
          const values: typeof client360ExternalEvents.$inferInsert = {
            profileId,
            provider: "skedu",
            externalId: appointmentUuid,
            externalKey,
            userExternalId: userUuid || null,
            businessExternalId: String(appointment.BusinessUUID ?? "").trim() || null,
            serviceKey: inferSkeduClientService(serviceName),
            serviceName,
            variantName: String(appointment.Variant?.Name ?? appointment.VariantName ?? "").trim() || null,
            eventDate: start.date,
            startTime: start.time,
            endTime: end?.time ?? null,
            status: skeduClientEventStatus(appointment),
            paymentStatus: "unknown",
            listedAmountClp: money(
              appointment.SessionPriceWithDiscount ?? appointment.SessionPrice ?? 0
            ),
            clientName: userName || null,
            clientEmail: userEmail,
            clientPhone: userPhone,
            nativeKind: native?.kind ?? null,
            nativeReservationId: native?.id ?? null,
            sourceCreatedAt: nullableDate(appointment.CreatedAt),
            sourceUpdatedAt: nullableDate(appointment.UpdatedAt),
            rawJson: JSON.stringify(appointment),
            lastSyncedAt: new Date(),
          };
          externalEventUpserts.push({ values, existed: Boolean(previous) });
        }

        // Una importación anual puede contener miles de citas. Las escrituras
        // individuales siguen siendo idempotentes, pero se ejecutan con
        // concurrencia acotada para evitar miles de viajes secuenciales a TiDB
        // sin saturar el pool de conexiones.
        const externalUpsertConcurrency = 25;
        for (let index = 0; index < externalEventUpserts.length; index += externalUpsertConcurrency) {
          const chunk = externalEventUpserts.slice(index, index + externalUpsertConcurrency);
          await Promise.all(chunk.map(item =>
            db.insert(client360ExternalEvents).values(item.values)
              .onDuplicateKeyUpdate({ set: item.values })
          ));
          for (const item of chunk) {
            if (item.existed) stats.updated += 1;
            else stats.inserted += 1;
          }
        }

        return stats;
      }),

    mergeProfiles: protectedProcedure
      .input(z.object({
        sourceProfileId: z.number().int().positive(),
        targetProfileId: z.number().int().positive(),
        reason: z.string().trim().min(5).max(500),
      }).refine(value => value.sourceProfileId !== value.targetProfileId, {
        message: "Selecciona dos fichas diferentes",
      }))
      .mutation(async ({ ctx, input }) => {
        assertClientProfileAccess(ctx.user);
        if (!isAdminRole(ctx.user.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Solo administración puede fusionar fichas" });
        }
        const db = await database();
        await db.transaction(async tx => {
          const [[source], [target]] = await Promise.all([
            tx.select().from(client360Profiles)
              .where(eq(client360Profiles.id, input.sourceProfileId)).limit(1),
            tx.select().from(client360Profiles)
              .where(eq(client360Profiles.id, input.targetProfileId)).limit(1),
          ]);
          if (!source || !target) throw new TRPCError({ code: "NOT_FOUND" });
          if (source.status !== "active" || target.status !== "active") {
            throw new TRPCError({ code: "CONFLICT", message: "Una de las fichas ya fue fusionada" });
          }
          const [sourceIdentities, targetIdentities] = await Promise.all([
            tx.select().from(client360Identities)
              .where(eq(client360Identities.profileId, source.id)),
            tx.select().from(client360Identities)
              .where(eq(client360Identities.profileId, target.id)),
          ]);
          const targetAliases = new Set(
            targetIdentities.map(identity => `${identity.kind}:${identity.normalizedValue}`)
          );
          for (const identity of sourceIdentities) {
            if (targetAliases.has(`${identity.kind}:${identity.normalizedValue}`)) continue;
            await tx.update(client360Identities).set({ profileId: target.id })
              .where(eq(client360Identities.id, identity.id));
          }
          await tx.update(client360ReservationLinks).set({
            profileId: target.id,
            linkedBy: "merge",
            createdByUserId: ctx.user.id,
          }).where(eq(client360ReservationLinks.profileId, source.id));
          await tx.update(client360ExternalEvents).set({ profileId: target.id })
            .where(eq(client360ExternalEvents.profileId, source.id));
          await tx.update(client360Profiles).set({
            displayName: target.displayName || source.displayName,
            primaryEmail: target.primaryEmail ?? source.primaryEmail,
            primaryPhone: target.primaryPhone ?? source.primaryPhone,
            notes: target.notes ?? source.notes,
            updatedByUserId: ctx.user.id,
          }).where(eq(client360Profiles.id, target.id));
          await tx.update(client360Profiles).set({
            status: "merged",
            mergedIntoProfileId: target.id,
            updatedByUserId: ctx.user.id,
          }).where(eq(client360Profiles.id, source.id));
          const detail = JSON.stringify({
            reason: input.reason,
            source: { id: source.id, name: source.displayName, email: source.primaryEmail, phone: source.primaryPhone },
            target: { id: target.id, name: target.displayName, email: target.primaryEmail, phone: target.primaryPhone },
          });
          await tx.insert(client360Audit).values([
            {
              profileId: target.id,
              relatedProfileId: source.id,
              action: "profiles_merged_into_target",
              actorUserId: ctx.user.id,
              detail,
            },
            {
              profileId: source.id,
              relatedProfileId: target.id,
              action: "profile_merged_into_another",
              actorUserId: ctx.user.id,
              detail,
            },
          ]);
        });
        return { success: true, profileId: input.targetProfileId };
      }),
  }),
});
