import { TRPCError } from "@trpc/server";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import {
  biopoolBookings,
  biopoolBookingActivity,
  biopoolNotifications,
  biopoolServices,
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
} from "../drizzle/schema";
import {
  hasCmsPermission,
  type PermissionUser,
} from "../shared/permissions";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const serviceSchema = z.enum(["massages", "biopools", "regular_classes"]);
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
]);
type ClientEvent = {
  id: string;
  clientKey: string;
  service: ServiceKey;
  date: string;
  startTime: string | null;
  title: string;
  status: string;
  paymentStatus: string | null;
  amountClp: number;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  detail: string | null;
  npsScore?: number | null;
  npsComment?: string | null;
};

function serializeDate(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

function normalizedPhone(value?: string | null): string {
  return (value ?? "").replace(/\D/g, "");
}

export function buildClientKey(input: {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
}): string {
  const email = input.email?.trim().toLocaleLowerCase();
  if (email) return `email:${email}`;
  const phone = normalizedPhone(input.phone);
  if (phone.length >= 8) return `phone:${phone}`;
  return `name:${(input.name ?? "sin nombre").trim().toLocaleLowerCase()}`;
}

export function isVisibleCalendarReservation(status?: string | null): boolean {
  return status !== "cancelled";
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
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
}) {
  const discountAmountClp = money(input.discountAmountClp);
  const amountPaidClp = money(input.amountPaidClp);
  const originalAmountClp = input.originalAmountClp == null
    ? Math.max(0, amountPaidClp + discountAmountClp)
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
  } else if (amountPaidClp > 0 || input.method) {
    lines.push({
      id: "payment:summary",
      type: "payment",
      method: input.method ?? "Sin registrar",
      status: input.status ?? "paid",
      amountClp: amountPaidClp,
      reference: input.reference ?? null,
      cardType: null,
      at: input.createdAt ?? null,
    });
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
    ...(hasCmsPermission(user, "regular_classes.students") ? ["regular_classes" as const] : []),
  ];
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

async function loadClientEvents(user: PermissionUser): Promise<ClientEvent[]> {
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
    const [standard, programs, npsResponses] = await Promise.all([
      db
        .select({
          id: massageBookings.id,
          name: massageBookings.clientName,
          email: massageBookings.clientEmail,
          phone: massageBookings.clientPhone,
          date: massageBookings.bookingDate,
          time: massageBookings.startTime,
          status: massageBookings.status,
          paymentStatus: massageBookings.paymentStatus,
          amount: massageBookings.amountPaid,
          title: massageTechniques.name,
          notes: massageBookings.notes,
        })
        .from(massageBookings)
        .leftJoin(massageTechniques, eq(massageBookings.techniqueId, massageTechniques.id)),
      db.select().from(massageProgramBookings),
      db.select().from(massageNpsResponses),
    ]);
    for (const row of standard) {
      const nps = npsResponses.find(item => item.bookingType === "massage" && item.bookingId === row.id);
      events.push({
        id: `massage:${row.id}`,
        clientKey: buildClientKey(row),
        service: "massages",
        date: serializeDate(row.date),
        startTime: row.time,
        title: row.title ?? "Masaje",
        status: row.status,
        paymentStatus: row.paymentStatus,
        amountClp: money(row.amount),
        clientName: row.name,
        clientEmail: row.email,
        clientPhone: row.phone,
        detail: row.notes,
        npsScore: nps?.score ?? null,
        npsComment: nps?.comment ?? null,
      });
    }
    for (const row of programs) {
      const nps = npsResponses.find(item => item.bookingType === "skedu_program" && item.bookingId === row.id);
      events.push({
        id: `massage-program:${row.id}`,
        clientKey: buildClientKey({ email: row.clientEmail, phone: row.clientPhone, name: row.clientName }),
        service: "massages",
        date: serializeDate(row.bookingDate),
        startTime: row.startTime,
        title: `Programa ${row.program.replaceAll("_", " ")}`,
        status: row.status,
        paymentStatus: row.status === "cancelled" ? null : "paid",
        amountClp: 0,
        clientName: row.secondClientName
          ? `${row.clientName} / ${row.secondClientName}`
          : row.clientName,
        clientEmail: row.clientEmail,
        clientPhone: row.clientPhone,
        detail: row.notes,
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
      events.push({
        id: `biopool:${booking.id}`,
        clientKey: buildClientKey({
          email: booking.clientEmail,
          phone: booking.clientPhone,
          name: booking.clientName,
        }),
        service: "biopools",
        date: serializeDate(booking.bookingDate),
        startTime: booking.startTime,
        title: serviceName,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        amountClp: booking.amountPaidClp,
        clientName: booking.clientName,
        clientEmail: booking.clientEmail,
        clientPhone: booking.clientPhone,
        detail: `${booking.adultQuantity} adulto(s) · ${booking.childQuantity} niño(s)`,
      });
    }
  }

  if (allowed.includes("regular_classes")) {
    const rows = await db
      .select({
        membership: regularClassMemberships,
        student: regularClassStudents,
        planName: regularClassPlans.name,
      })
      .from(regularClassMemberships)
      .innerJoin(regularClassStudents, eq(regularClassMemberships.studentId, regularClassStudents.id))
      .innerJoin(regularClassPlans, eq(regularClassMemberships.planId, regularClassPlans.id));
    for (const { membership, student, planName } of rows) {
      const name = [student.firstName, student.lastName].filter(Boolean).join(" ");
      events.push({
        id: `regular-class:${membership.id}`,
        clientKey: buildClientKey({ email: student.email, phone: student.phone, name }),
        service: "regular_classes",
        date: serializeDate(membership.periodStart),
        startTime: null,
        title: planName,
        status: membership.status,
        paymentStatus: membership.paymentStatus,
        amountClp: membership.pricePaidClp,
        clientName: name,
        clientEmail: student.email,
        clientPhone: student.phone,
        detail: `Vigencia hasta ${serializeDate(membership.periodEnd)}`,
      });
    }
  }
  return events;
}

export const operations360Router = router({
  access: protectedProcedure.query(({ ctx }) => ({
    calendarServices: calendarServices(ctx.user),
    clientServices: clientServices(ctx.user),
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
        const [standard, programs] = await Promise.all([
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
            paymentStatus: row.status === "cancelled" ? null : "paid",
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
        const [activity, notifications, paymentRows] = await Promise.all([
          db.select().from(biopoolBookingActivity)
            .where(eq(biopoolBookingActivity.bookingId, input.entityId)),
          db.select().from(biopoolNotifications)
            .where(eq(biopoolNotifications.bookingId, input.entityId)),
          db.select().from(reservationPayments)
            .where(and(
              eq(reservationPayments.module, "biopools"),
              eq(reservationPayments.reservationId, input.entityId),
            )),
        ]);
        const booking = row.booking;
        return {
          service: "biopools" as const,
          title: row.serviceName,
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
          }),
          notes: booking.notes,
          detail: `${booking.adultQuantity} adulto(s) · ${booking.childQuantity} niño(s) · ${booking.totalGuests} personas`,
          activity: [
            ...activity.map(item => ({
              id: `activity:${item.id}`,
              type: "activity",
              label: item.action,
              detail: item.detail,
              at: item.createdAt,
            })),
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
            title: row.techniqueName ?? "Masaje",
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
              ...(booking.cancelledAt ? [{ id: `cancelled:${booking.id}`, type: "activity", label: "Reserva cancelada", detail: booking.cancellationReason, at: booking.cancelledAt }] : []),
              ...(nps?.respondedAt ? [{ id: `nps:${nps.id}`, type: "nps", label: `NPS ${nps.score}/10`, detail: nps.comment, at: nps.respondedAt }] : []),
            ].sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime()),
            href: `/cms/masajes/agenda?date=${serializeDate(booking.bookingDate)}`,
          };
        }

        const [booking] = await db.select().from(massageProgramBookings)
          .where(eq(massageProgramBookings.id, input.entityId)).limit(1);
        if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
        const [nps] = await db.select().from(massageNpsResponses)
          .where(and(
            eq(massageNpsResponses.bookingType, "skedu_program"),
            eq(massageNpsResponses.bookingId, input.entityId),
          )).limit(1);
        return {
          service: "massages" as const,
          title: `Programa ${booking.program.replaceAll("_", " ")}`,
          client: { name: booking.clientName, email: booking.clientEmail, phone: booking.clientPhone },
          schedule: { date: serializeDate(booking.bookingDate), startTime: booking.startTime, endTime: booking.endTime },
          status: booking.status,
          payment: buildPaymentDetail({
            status: booking.status === "cancelled" ? null : "paid",
            method: booking.paymentMethod,
            reference: booking.paymentReference,
            amountPaidClp: 0,
            refundAmountClp: 0,
            createdAt: booking.createdAt,
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
        const [[booking], paymentRows] = await Promise.all([
          db.select()
            .from(saunaBookings)
            .where(eq(saunaBookings.id, input.entityId))
            .limit(1),
          db.select().from(reservationPayments)
            .where(and(
              eq(reservationPayments.module, "sauna"),
              eq(reservationPayments.reservationId, input.entityId),
            )),
        ]);
        if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
        return {
          service: "sauna" as const,
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

  clients: router({
    list: protectedProcedure
      .input(
        z.object({
          search: z.string().trim().max(100).optional(),
          service: serviceSchema.optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const events = await loadClientEvents(ctx.user);
        const grouped = new Map<string, ClientEvent[]>();
        for (const event of events) {
          const current = grouped.get(event.clientKey) ?? [];
          current.push(event);
          grouped.set(event.clientKey, current);
        }
        const search = input.search?.toLocaleLowerCase() ?? "";
        return Array.from(grouped.entries())
          .map(([key, history]) => {
            const ordered = history.sort((a, b) => b.date.localeCompare(a.date));
            const latest = ordered[0];
            return {
              key,
              name: latest.clientName,
              email: latest.clientEmail,
              phone: latest.clientPhone,
              services: Array.from(new Set(history.map(item => item.service))),
              reservations: history.length,
              totalSpentClp: history.reduce((sum, item) => sum + item.amountClp, 0),
              lastActivity: latest.date,
            };
          })
          .filter(client => !input.service || client.services.includes(input.service))
          .filter(client =>
            !search ||
            [client.name, client.email, client.phone]
              .filter(Boolean)
              .some(value => value!.toLocaleLowerCase().includes(search))
          )
          .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity))
          .slice(0, 500);
      }),

    history: protectedProcedure
      .input(z.object({ clientKey: z.string().min(3), service: serviceSchema.optional() }))
      .query(async ({ ctx, input }) => {
        const events = await loadClientEvents(ctx.user);
        return events
          .filter(event => event.clientKey === input.clientKey)
          .filter(event => !input.service || event.service === input.service)
          .sort((a, b) => `${b.date} ${b.startTime ?? ""}`.localeCompare(`${a.date} ${a.startTime ?? ""}`));
      }),
  }),
});
