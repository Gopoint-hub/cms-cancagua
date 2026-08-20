import { TRPCError } from "@trpc/server";
import { buildBookingCode } from "../shared/bookingCode";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lte,
  ne,
  sql,
} from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  saunaBlocks,
  saunaBookings,
  saunaCheckoutOrders,
  saunaProgramQueue,
  saunaServices,
  saunaSettings,
  saunaSyncRuns,
  reservationPayments,
  giftCards,
  giftCardTransactions,
} from "../drizzle/schema";
import {
  addMinutesToTime,
  availableSaunaSeats,
  buildSaunaSlots,
  hasSaunaBookingLeadTime,
  saunaIntervalsOverlap,
  SAUNA_CAPACITY,
  validateSaunaParty,
} from "../shared/sauna";
import { hasCmsPermission, type CmsPermissionKey } from "../shared/permissions";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";
import { customerAcquisitionSchema } from "../shared/customerAcquisition";
import { saveCustomerPurchaseSurvey } from "./customerPurchaseSurvey";
import { getDb } from "./db";
import { chileLocalDateTimeToUtc } from "./massageNps";
import { syncSaunaFromSkedu } from "./saunaSync";
import {
  createTransaction,
  generateSaunaBuyOrder,
  generateSessionId,
} from "./webpay";
import { calculatedPaymentStatus } from "../shared/reservationPayments";
import { calculateWellnessCartDiscount } from "./massageDiscounts";
import { canRedeemGiftCard } from "./giftCardRedemption";
import { validatePublicGiftCard } from "./publicGiftCards";
import { finalizeApprovedSaunaOrder, saunaResultUrl } from "./saunaWebpay";
import {
  assertReservationPaymentEditable,
  redeemGiftCardPayment,
  reservationPaymentDate,
  reservationPaymentInputSchema,
  validateReservationPayment,
} from "./reservationPayments";
import {
  evaluateReschedulePolicy,
  validOverrideReason,
} from "./biopoolReschedulePolicy";
import {
  appendRescheduleAuditLine,
  buildRescheduleAuditLine,
  type ReschedulePolicyViolation,
} from "./rescheduleAudit";
import { assertNoLiveReservationPaymentAttempt } from "./reservationPaymentLinkGuards";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/);
const kindSchema = z.enum(["shared", "private", "staff", "detox", "manual"]);
const statusSchema = z.enum([
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
]);
const saunaPaymentMethods = [
  "pending_payment",
  "payment_link",
  "bank_transfer",
  "cash",
  "transbank_machine",
  "gift_card",
] as const;
const saunaPaymentSchema = reservationPaymentInputSchema.refine(
  payment => saunaPaymentMethods.includes(payment.method as any),
  { message: "Medio de pago no disponible para sauna", path: ["method"] }
);

function requirePermission(user: any, permission: CmsPermissionKey): void {
  if (!hasCmsPermission(user, permission)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No tienes permiso para realizar esta acción",
    });
  }
}

async function database() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Base de datos no disponible",
    });
  return db;
}

function serializeDate(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function chileToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());
}

function dayOfWeek(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function datesInMonth(month: string): string[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const totalDays = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: totalDays }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
}

type SaunaScheduleDay = {
  enabled: boolean;
  open: string | null;
  close: string | null;
};
type SaunaSchedule = Record<string, SaunaScheduleDay>;

function parseSchedule(value: string): SaunaSchedule {
  try {
    return JSON.parse(value) as SaunaSchedule;
  } catch {
    return {};
  }
}

export async function settings(executor: any) {
  const [row] = await executor
    .select()
    .from(saunaSettings)
    .where(eq(saunaSettings.id, 1))
    .limit(1);
  if (!row)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "La configuración de Sauna no está inicializada",
    });
  return row;
}

async function occupancyForDate(
  executor: any,
  date: string,
  excludeCheckoutOrderId?: number
) {
  const [bookings, blocks, holds] = await Promise.all([
    executor
      .select()
      .from(saunaBookings)
      .where(
        and(
          eq(saunaBookings.bookingDate, date),
          ne(saunaBookings.status, "cancelled")
        )
      ),
    executor
      .select()
      .from(saunaBlocks)
      .where(and(eq(saunaBlocks.blockDate, date), eq(saunaBlocks.active, 1))),
    executor
      .select()
      .from(saunaCheckoutOrders)
      .where(
        and(
          eq(saunaCheckoutOrders.bookingDate, date),
          inArray(saunaCheckoutOrders.status, [
            "initiating",
            "payment_pending",
          ]),
          gt(saunaCheckoutOrders.expiresAt, new Date()),
          excludeCheckoutOrderId
            ? ne(saunaCheckoutOrders.id, excludeCheckoutOrderId)
            : undefined
        )
      ),
  ]);
  return [
    ...bookings.map((item: any) => ({
      type: "booking" as const,
      id: item.id,
      startTime: item.startTime,
      endTime: item.endTime,
      guests: item.guests,
      capacityUsed: item.capacityUsed,
      isPrivate: item.isPrivate,
      status: item.status,
    })),
    ...blocks.map((item: any) => ({
      type: "block" as const,
      id: item.id,
      startTime: item.startTime,
      endTime: item.endTime,
      guests: item.blockedCapacity,
      capacityUsed: item.blockedCapacity,
      isPrivate: 0,
      status: "active",
    })),
    ...holds.map((item: any) => ({
      type: "hold" as const,
      id: item.id,
      startTime: item.startTime,
      endTime: item.endTime,
      guests: item.guests,
      capacityUsed: item.capacityUsed,
      isPrivate: item.isPrivate,
      status: "active",
    })),
  ];
}

function availabilityForInterval(
  occupancy: any[],
  startTime: string,
  endTime: string
): number {
  const overlapping = occupancy.filter(item =>
    saunaIntervalsOverlap(startTime, endTime, item.startTime, item.endTime)
  );
  return availableSaunaSeats(overlapping);
}

export async function availabilityForDay(
  executor: any,
  date: string,
  excludeCheckoutOrderId?: number
) {
  const config = await settings(executor);
  const schedule = parseSchedule(config.scheduleJson)[String(dayOfWeek(date))];
  const occupancy = await occupancyForDate(
    executor,
    date,
    excludeCheckoutOrderId
  );
  if (!schedule?.enabled || !schedule.open || !schedule.close) {
    return { date, capacity: config.capacity, schedule, slots: [], occupancy };
  }
  const slots = buildSaunaSlots(
    schedule.open,
    schedule.close,
    config.slotIntervalMinutes,
    config.durationMinutes
  ).map(slot => {
    const availableSeats = availabilityForInterval(
      occupancy,
      slot.startTime,
      slot.endTime
    );
    return {
      ...slot,
      availableSeats,
      occupiedSeats: config.capacity - availableSeats,
      privateAvailable: availableSeats === config.capacity,
    };
  });
  return { date, capacity: config.capacity, schedule, slots, occupancy };
}

async function assertCapacity(
  executor: any,
  input: {
    date: string;
    startTime: string;
    endTime: string;
    capacityUsed: number;
  },
  excludeBookingId?: number
) {
  const occupancy = (await occupancyForDate(executor, input.date)).filter(
    item => item.type !== "booking" || item.id !== excludeBookingId
  );
  const available = availabilityForInterval(
    occupancy,
    input.startTime,
    input.endTime
  );
  if (available < input.capacityUsed) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Solo quedan ${available} de los ${SAUNA_CAPACITY} cupos para este horario`,
    });
  }
  return available;
}

export async function acquireCapacityLock(
  executor: any,
  _date: string
): Promise<void> {
  // InnoDB mantiene este bloqueo hasta que la transacción termina realmente.
  // Esto evita la ventana que dejaba GET_LOCK/RELEASE_LOCK entre el callback y
  // el COMMIT de Drizzle. Se serializan las mutaciones de aforo, de bajo volumen.
  await executor.execute(
    sql`SELECT id FROM sauna_settings WHERE id = 1 FOR UPDATE`
  );
}

export async function releaseCapacityLock(
  _executor: any,
  _date: string
): Promise<void> {
  // El bloqueo de fila se libera automáticamente después de COMMIT o ROLLBACK.
}

export const saunaRouter = router({
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    requirePermission(ctx.user, "module.sauna");
    const db = await database();
    const today = chileToday();
    const [
      bookings,
      dayAvailability,
      pendingPrograms,
      lastSync,
      manualReviewOrders,
    ] = await Promise.all([
      db
        .select()
        .from(saunaBookings)
        .where(
          and(
            eq(saunaBookings.bookingDate, today),
            ne(saunaBookings.status, "cancelled")
          )
        )
        .orderBy(asc(saunaBookings.startTime)),
      availabilityForDay(db, today),
      db
        .select()
        .from(saunaProgramQueue)
        .where(eq(saunaProgramQueue.status, "pending"))
        .orderBy(asc(saunaProgramQueue.programStartsAt)),
      db
        .select()
        .from(saunaSyncRuns)
        .orderBy(desc(saunaSyncRuns.startedAt))
        .limit(1),
      db
        .select({ id: saunaCheckoutOrders.id })
        .from(saunaCheckoutOrders)
        .where(eq(saunaCheckoutOrders.status, "manual_review")),
    ]);
    const alerts: Array<{ type: string; message: string; bookingId?: number }> =
      [];
    for (const slot of dayAvailability.slots) {
      if (slot.occupiedSeats > SAUNA_CAPACITY)
        alerts.push({
          type: "overcapacity",
          message: `${slot.startTime}: sobrecupo detectado`,
        });
    }
    for (const booking of bookings) {
      if (
        !dayAvailability.slots.some(slot =>
          saunaIntervalsOverlap(
            booking.startTime,
            booking.endTime,
            slot.startTime,
            slot.endTime
          )
        )
      ) {
        alerts.push({
          type: "outside_schedule",
          message: `${booking.startTime}: reserva fuera del horario regular`,
          bookingId: booking.id,
        });
      }
      if (!booking.isConfirmed)
        alerts.push({
          type: "unconfirmed",
          message: `${booking.startTime}: reserva sin confirmar`,
          bookingId: booking.id,
        });
      if (booking.paymentStatus !== "paid")
        alerts.push({
          type: "payment_pending",
          message: `${booking.startTime}: ${booking.clientName || "reserva"} pendiente de pago`,
          bookingId: booking.id,
        });
    }
    if (pendingPrograms.length)
      alerts.push({
        type: "detox",
        message: `${pendingPrograms.length} pase(s) Detox aún no tienen horario de sauna`,
      });
    if (manualReviewOrders.length)
      alerts.push({
        type: "payment_manual_review",
        message: `${manualReviewOrders.length} pago(s) Webpay requieren conciliación manual`,
      });
    return {
      today,
      capacity: SAUNA_CAPACITY,
      bookings,
      slots: dayAvailability.slots,
      guests: bookings.reduce((sum, item) => sum + item.guests, 0),
      privateBookings: bookings.filter(item => Boolean(item.isPrivate)).length,
      unconfirmed: bookings.filter(item => !item.isConfirmed).length,
      pendingPrograms: pendingPrograms.length,
      manualReviewPayments: manualReviewOrders.length,
      alerts,
      lastSync: lastSync[0] ?? null,
    };
  }),

  settings: protectedProcedure.query(async ({ ctx }) => {
    requirePermission(ctx.user, "module.sauna");
    const row = await settings(await database());
    return { ...row, schedule: parseSchedule(row.scheduleJson) };
  }),
  updateCheckout: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      requirePermission(ctx.user, "sauna.manage_settings");
      await (
        await database()
      )
        .update(saunaSettings)
        .set({ checkoutEnabled: input.enabled ? 1 : 0 })
        .where(eq(saunaSettings.id, 1));
      return { success: true, enabled: input.enabled };
    }),

  services: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      requirePermission(ctx.user, "module.sauna");
      return (await database())
        .select()
        .from(saunaServices)
        .orderBy(asc(saunaServices.partySize));
    }),
  }),

  agenda: router({
    list: protectedProcedure
      .input(z.object({ from: dateSchema, to: dateSchema }))
      .query(async ({ ctx, input }) => {
        requirePermission(ctx.user, "module.sauna");
        return (await database())
          .select()
          .from(saunaBookings)
          .where(
            and(
              gte(saunaBookings.bookingDate, input.from),
              lte(saunaBookings.bookingDate, input.to)
            )
          )
          .orderBy(
            asc(saunaBookings.bookingDate),
            asc(saunaBookings.startTime)
          );
      }),
    availability: protectedProcedure
      .input(z.object({ date: dateSchema }))
      .query(async ({ ctx, input }) => {
        requirePermission(ctx.user, "module.sauna");
        return availabilityForDay(await database(), input.date);
      }),
    create: protectedProcedure
      .input(
        z.object({
          serviceName: z.string().trim().min(2).max(220),
          kind: kindSchema.exclude(["detox"]),
          clientName: z.string().trim().max(200).optional(),
          clientEmail: z.string().trim().email().or(z.literal("")).optional(),
          clientPhone: z.string().trim().max(40).optional(),
          bookingDate: dateSchema,
          startTime: timeSchema,
          guests: z.number().int().min(1).max(6),
          isPrivate: z.boolean(),
          paymentStatus: z
            .enum(["unknown", "pending", "paid"])
            .default("unknown"),
          paymentMethod: z.string().max(60).optional(),
          amountClp: z.number().int().min(0).default(0),
          payments: z.array(saunaPaymentSchema).min(1).max(10).optional(),
          notes: z.string().max(4000).optional(),
          isConfirmed: z.boolean().default(true),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "sauna.manage_agenda");
        const payments = input.payments ?? [];
        payments.forEach(validateReservationPayment);
        if (
          payments.some(payment => payment.method === "gift_card") &&
          !canRedeemGiftCard(ctx.user)
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "No tienes permisos para canjear Gift Cards",
          });
        const plannedClp = payments.reduce(
          (sum, payment) => sum + payment.amountClp,
          0
        );
        const paidClp = payments
          .filter(payment => payment.status === "paid")
          .reduce((sum, payment) => sum + payment.amountClp, 0);
        if (plannedClp > input.amountClp)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Los pagos superan el total de la reserva",
          });
        const privateBooking =
          input.isPrivate || input.kind === "private" || input.guests >= 4;
        const partyError = validateSaunaParty(input.guests, privateBooking);
        if (partyError)
          throw new TRPCError({ code: "BAD_REQUEST", message: partyError });
        const db = await database();
        return db.transaction(async tx => {
          await acquireCapacityLock(tx, input.bookingDate);
          try {
            const endTime = addMinutesToTime(input.startTime, 60);
            const capacityUsed = privateBooking ? SAUNA_CAPACITY : input.guests;
            await assertCapacity(tx, {
              date: input.bookingDate,
              startTime: input.startTime,
              endTime,
              capacityUsed,
            });
            const [created] = await tx
              .insert(saunaBookings)
              .values({
                bookingCode: buildBookingCode("SAU", input.bookingDate),
                serviceName: input.serviceName,
                kind: privateBooking ? "private" : input.kind,
                clientName: input.clientName || null,
                clientEmail: input.clientEmail || null,
                clientPhone: input.clientPhone || null,
                bookingDate: input.bookingDate,
                startTime: input.startTime,
                endTime,
                guests: input.guests,
                capacityUsed,
                isPrivate: privateBooking ? 1 : 0,
                status: input.isConfirmed ? "confirmed" : "pending",
                isConfirmed: input.isConfirmed ? 1 : 0,
                paymentStatus: payments.length
                  ? calculatedPaymentStatus(paidClp, input.amountClp)
                  : input.paymentStatus,
                paymentMethod:
                  payments.length > 1
                    ? "mixed"
                    : payments[0]?.method || input.paymentMethod || null,
                amountClp: input.amountClp,
                amountPaidClp: payments.length
                  ? paidClp
                  : input.paymentStatus === "paid"
                    ? input.amountClp
                    : 0,
                source: "cms",
                origin: "panel",
                notes: input.notes || null,
                createdByUserId: ctx.user.id,
              })
              .$returningId();
            for (const payment of payments) {
              const gift =
                payment.method === "gift_card"
                  ? await redeemGiftCardPayment({
                      tx,
                      payment,
                      totalClp: input.amountClp,
                      module: "sauna",
                      reservationId: created.id,
                      note: `Canje en sauna ${input.clientName || created.id}`,
                      serviceKey: "sauna",
                    })
                  : undefined;
              await tx.insert(reservationPayments).values({
                module: "sauna",
                reservationId: created.id,
                method: payment.method,
                status: payment.status,
                amountClp: payment.amountClp,
                paidAt:
                  payment.status === "paid"
                    ? reservationPaymentDate(payment.paidAt)
                    : null,
                reference: gift?.code ?? payment.reference ?? null,
                cardType: payment.cardType ?? null,
                giftCardId: gift?.id ?? null,
                createdByUserId: ctx.user.id,
              });
            }
            return created;
          } finally {
            await releaseCapacityLock(tx, input.bookingDate);
          }
        });
      }),
    getPayments: protectedProcedure
      .input(z.object({ bookingId: z.number() }))
      .query(async ({ ctx, input }) => {
        requirePermission(ctx.user, "module.sauna");
        const db = await database();
        return db
          .select()
          .from(reservationPayments)
          .where(
            and(
              eq(reservationPayments.module, "sauna"),
              eq(reservationPayments.reservationId, input.bookingId)
            )
          )
          .orderBy(desc(reservationPayments.createdAt));
      }),
    addPayment: protectedProcedure
      .input(z.object({ bookingId: z.number(), payment: saunaPaymentSchema }))
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "sauna.manage_agenda");
        validateReservationPayment(input.payment);
        if (
          input.payment.method === "gift_card" &&
          !canRedeemGiftCard(ctx.user)
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "No tienes permisos para canjear Gift Cards",
          });
        const db = await database();
        return db.transaction(async tx => {
          await assertNoLiveReservationPaymentAttempt(
            tx,
            "sauna",
            input.bookingId
          );
          const [booking] = await tx
            .select()
            .from(saunaBookings)
            .where(eq(saunaBookings.id, input.bookingId))
            .limit(1);
          if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
          if (booking.status === "cancelled")
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "No se pueden agregar pagos a una reserva cancelada",
            });
          const existing = await tx
            .select()
            .from(reservationPayments)
            .where(
              and(
                eq(reservationPayments.module, "sauna"),
                eq(reservationPayments.reservationId, booking.id)
              )
            );
          const planned = existing.length
            ? existing
                .filter(payment => payment.status !== "refunded")
                .reduce((sum, payment) => sum + payment.amountClp, 0)
            : booking.amountPaidClp;
          if (planned + input.payment.amountClp > booking.amountClp)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "El abono supera el saldo pendiente de la reserva",
            });
          const gift =
            input.payment.method === "gift_card"
              ? await redeemGiftCardPayment({
                  tx,
                  payment: input.payment,
                  totalClp: booking.amountClp,
                  module: "sauna",
                  reservationId: booking.id,
                  note: `Abono Gift Card en sauna ${booking.bookingCode}`,
                  serviceKey: "sauna",
                })
              : undefined;
          const [created] = await tx
            .insert(reservationPayments)
            .values({
              module: "sauna",
              reservationId: booking.id,
              method: input.payment.method,
              status: input.payment.status,
              amountClp: input.payment.amountClp,
              paidAt:
                input.payment.status === "paid"
                  ? reservationPaymentDate(input.payment.paidAt)
                  : null,
              reference: gift?.code ?? input.payment.reference ?? null,
              cardType: input.payment.cardType ?? null,
              giftCardId: gift?.id ?? null,
              createdByUserId: ctx.user.id,
            })
            .$returningId();
          const newPaid =
            booking.amountPaidClp +
            (input.payment.status === "paid" ? input.payment.amountClp : 0);
          await tx
            .update(saunaBookings)
            .set({
              amountPaidClp: newPaid,
              paymentStatus: calculatedPaymentStatus(
                newPaid,
                booking.amountClp
              ),
              paymentMethod:
                existing.length || booking.amountPaidClp > 0
                  ? "mixed"
                  : input.payment.method,
            })
            .where(eq(saunaBookings.id, booking.id));
          return created;
        });
      }),
    completePayment: protectedProcedure
      .input(
        z.object({
          paymentId: z.number(),
          paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
          reference: z.string().trim().max(160),
          cardType: z.enum(["credit", "debit"]).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "sauna.manage_agenda");
        const db = await database();
        return db.transaction(async tx => {
          const [targetPayment] = await tx
            .select()
            .from(reservationPayments)
            .where(eq(reservationPayments.id, input.paymentId))
            .limit(1);
          if (targetPayment)
            await assertNoLiveReservationPaymentAttempt(
              tx,
              "sauna",
              targetPayment.reservationId
            );
          const [payment] = await tx
            .select()
            .from(reservationPayments)
            .where(
              and(
                eq(reservationPayments.id, input.paymentId),
                eq(reservationPayments.module, "sauna")
              )
            )
            .limit(1);
          if (!payment || payment.status !== "pending")
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "El pago no está pendiente",
            });
          const [booking] = await tx
            .select()
            .from(saunaBookings)
            .where(eq(saunaBookings.id, payment.reservationId))
            .limit(1);
          if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
          const newPaid = booking.amountPaidClp + payment.amountClp;
          await tx
            .update(reservationPayments)
            .set({
              status: "paid",
              paidAt: reservationPaymentDate(input.paidAt),
              reference: input.reference,
              cardType: input.cardType ?? null,
            })
            .where(eq(reservationPayments.id, payment.id));
          await tx
            .update(saunaBookings)
            .set({
              amountPaidClp: newPaid,
              paymentStatus: calculatedPaymentStatus(
                newPaid,
                booking.amountClp
              ),
            })
            .where(eq(saunaBookings.id, booking.id));
          return { success: true };
        });
      }),
    updatePayment: protectedProcedure
      .input(z.object({ paymentId: z.number(), payment: saunaPaymentSchema }))
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "sauna.manage_agenda");
        validateReservationPayment(input.payment);
        if (input.payment.method === "gift_card")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Para cambiar una Gift Card, elimina el pago y registra uno nuevo",
          });
        const db = await database();
        return db.transaction(async tx => {
          const [targetPayment] = await tx
            .select()
            .from(reservationPayments)
            .where(eq(reservationPayments.id, input.paymentId))
            .limit(1);
          if (targetPayment)
            await assertNoLiveReservationPaymentAttempt(
              tx,
              "sauna",
              targetPayment.reservationId
            );
          const [payment] = await tx
            .select()
            .from(reservationPayments)
            .where(
              and(
                eq(reservationPayments.id, input.paymentId),
                eq(reservationPayments.module, "sauna")
              )
            )
            .limit(1);
          if (!payment)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Pago no encontrado",
            });
          assertReservationPaymentEditable(payment);
          if (payment.giftCardId)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Para cambiar una Gift Card, elimina el pago y registra uno nuevo",
            });
          const [booking] = await tx
            .select()
            .from(saunaBookings)
            .where(eq(saunaBookings.id, payment.reservationId))
            .limit(1);
          if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
          const rows = await tx
            .select()
            .from(reservationPayments)
            .where(
              and(
                eq(reservationPayments.module, "sauna"),
                eq(reservationPayments.reservationId, booking.id)
              )
            );
          const legacy = Math.max(
            0,
            booking.amountPaidClp -
              rows
                .filter(row => row.status === "paid")
                .reduce((sum, row) => sum + row.amountClp, 0)
          );
          const otherPlanned = rows
            .filter(row => row.id !== payment.id && row.status !== "refunded")
            .reduce((sum, row) => sum + row.amountClp, 0);
          if (
            legacy + otherPlanned + input.payment.amountClp >
            booking.amountClp
          )
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Los pagos superan el total de la reserva",
            });
          await tx
            .update(reservationPayments)
            .set({
              method: input.payment.method,
              status: input.payment.status,
              amountClp: input.payment.amountClp,
              paidAt:
                input.payment.status === "paid"
                  ? reservationPaymentDate(input.payment.paidAt)
                  : null,
              reference: input.payment.reference ?? null,
              cardType: input.payment.cardType ?? null,
            })
            .where(eq(reservationPayments.id, payment.id));
          const newPaid =
            legacy +
            rows
              .filter(row => row.id !== payment.id && row.status === "paid")
              .reduce((sum, row) => sum + row.amountClp, 0) +
            (input.payment.status === "paid" ? input.payment.amountClp : 0);
          const remaining = rows.filter(
            row => row.id !== payment.id && row.status !== "refunded"
          );
          remaining.push({
            ...payment,
            method: input.payment.method,
            status: input.payment.status,
            amountClp: input.payment.amountClp,
          });
          await tx
            .update(saunaBookings)
            .set({
              amountPaidClp: newPaid,
              paymentStatus: calculatedPaymentStatus(
                newPaid,
                booking.amountClp
              ),
              paymentMethod:
                legacy === 0 && remaining.length === 1
                  ? remaining[0].method
                  : "mixed",
              paymentReference:
                legacy === 0 && remaining.length === 1
                  ? (input.payment.reference ?? null)
                  : null,
            })
            .where(eq(saunaBookings.id, booking.id));
          return { success: true };
        });
      }),
    removePayment: protectedProcedure
      .input(z.object({ paymentId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "sauna.manage_agenda");
        const db = await database();
        return db.transaction(async tx => {
          const [targetPayment] = await tx
            .select()
            .from(reservationPayments)
            .where(eq(reservationPayments.id, input.paymentId))
            .limit(1);
          if (targetPayment)
            await assertNoLiveReservationPaymentAttempt(
              tx,
              "sauna",
              targetPayment.reservationId
            );
          const [payment] = await tx
            .select()
            .from(reservationPayments)
            .where(
              and(
                eq(reservationPayments.id, input.paymentId),
                eq(reservationPayments.module, "sauna")
              )
            )
            .limit(1);
          if (!payment)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Pago no encontrado",
            });
          assertReservationPaymentEditable(payment);
          const [booking] = await tx
            .select()
            .from(saunaBookings)
            .where(eq(saunaBookings.id, payment.reservationId))
            .limit(1);
          if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
          const rows = await tx
            .select()
            .from(reservationPayments)
            .where(
              and(
                eq(reservationPayments.module, "sauna"),
                eq(reservationPayments.reservationId, booking.id)
              )
            );
          const legacy = Math.max(
            0,
            booking.amountPaidClp -
              rows
                .filter(row => row.status === "paid")
                .reduce((sum, row) => sum + row.amountClp, 0)
          );
          if (payment.giftCardId) {
            const [card] = await tx
              .select()
              .from(giftCards)
              .where(eq(giftCards.id, payment.giftCardId))
              .limit(1);
            if (!card)
              throw new TRPCError({
                code: "NOT_FOUND",
                message: "Gift Card no encontrada",
              });
            const balanceAfter =
              card.amount === 0
                ? 0
                : Math.min(card.amount, card.balance + payment.amountClp);
            await tx
              .update(giftCards)
              .set({
                balance: balanceAfter,
                status: "active",
                redeemedAt: null,
              })
              .where(eq(giftCards.id, card.id));
            await tx.insert(giftCardTransactions).values({
              giftCardId: card.id,
              transactionType: "refund",
              amount: payment.amountClp,
              balanceBefore: card.balance,
              balanceAfter,
              orderType: "sauna_booking",
              orderId: String(booking.id),
              notes: `Pago eliminado desde CMS por ${ctx.user.name || ctx.user.email || "usuario"}`,
            });
          }
          await tx
            .delete(reservationPayments)
            .where(eq(reservationPayments.id, payment.id));
          const remaining = rows.filter(
            row => row.id !== payment.id && row.status !== "refunded"
          );
          const newPaid =
            legacy +
            remaining
              .filter(row => row.status === "paid")
              .reduce((sum, row) => sum + row.amountClp, 0);
          await tx
            .update(saunaBookings)
            .set({
              amountPaidClp: newPaid,
              paymentStatus: calculatedPaymentStatus(
                newPaid,
                booking.amountClp
              ),
              paymentMethod:
                legacy === 0 && remaining.length === 1
                  ? remaining[0].method
                  : remaining.length || legacy
                    ? "mixed"
                    : null,
              paymentReference:
                legacy === 0 && remaining.length === 1
                  ? remaining[0].reference
                  : null,
            })
            .where(eq(saunaBookings.id, booking.id));
          return { success: true };
        });
      }),
    setStatus: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: statusSchema,
          overridePolicy: z.boolean().default(false),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "sauna.manage_agenda");
        const db = await database();
        return db.transaction(async tx => {
          if (input.status !== "cancelled")
            await acquireCapacityLock(tx, "status-change");
          if (input.status === "cancelled")
            await assertNoLiveReservationPaymentAttempt(tx, "sauna", input.id);
          const [booking] = await tx
            .select()
            .from(saunaBookings)
            .where(eq(saunaBookings.id, input.id))
            .limit(1);
          if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
          if (booking.source === "skedu")
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message:
                "Las reservas originadas en Skedu deben modificarse en Skedu para evitar que la sincronización revierta el cambio",
            });
          if (
            input.status === "cancelled" &&
            booking.paymentStatus === "paid" &&
            booking.paymentMethod === "webpay_plus"
          ) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message:
                "Esta reserva fue pagada por Webpay. Procesa primero el reembolso en Transbank antes de liberarla en el CMS",
            });
          }
          if (input.status === "cancelled" && !input.overridePolicy) {
            const config = await settings(tx);
            const startsAt = chileLocalDateTimeToUtc(
              serializeDate(booking.bookingDate),
              booking.startTime
            );
            if (
              startsAt.getTime() - Date.now() <
              config.cancellationNoticeHours * 60 * 60_000
            ) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `La política exige cancelar con al menos ${config.cancellationNoticeHours} horas de anticipación`,
              });
            }
          }
          if (input.status !== "cancelled") {
            await assertCapacity(
              tx,
              {
                date: serializeDate(booking.bookingDate),
                startTime: booking.startTime,
                endTime: booking.endTime,
                capacityUsed: booking.capacityUsed,
              },
              booking.id
            );
          }
          await tx
            .update(saunaBookings)
            .set({
              status: input.status,
              isConfirmed:
                input.status === "confirmed" || input.status === "completed"
                  ? 1
                  : 0,
              cancelledAt: input.status === "cancelled" ? new Date() : null,
            })
            .where(eq(saunaBookings.id, input.id));
          return { success: true };
        });
      }),
    reschedule: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          bookingDate: dateSchema,
          startTime: timeSchema,
          overridePolicy: z.boolean().default(false),
          reason: z.string().trim().min(3).max(1000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "sauna.manage_agenda");
        const db = await database();
        return db.transaction(async tx => {
          await acquireCapacityLock(tx, input.bookingDate);
          await assertNoLiveReservationPaymentAttempt(tx, "sauna", input.id);
          const [booking] = await tx
            .select()
            .from(saunaBookings)
            .where(eq(saunaBookings.id, input.id))
            .limit(1);
          if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
          if (booking.source === "skedu")
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message:
                "Las reservas de Skedu deben reagendarse en Skedu; el CMS reflejará el cambio en la próxima sincronización",
            });
          const config = await settings(tx);
          const { exceedsMaximum, violatesNotice, canOverride } =
            evaluateReschedulePolicy({
              rescheduleCount: booking.rescheduleCount,
              maxReschedules: config.maxReschedules,
              hoursUntilStart:
                (chileLocalDateTimeToUtc(
                  serializeDate(booking.bookingDate),
                  booking.startTime
                ).getTime() -
                  Date.now()) /
                (60 * 60_000),
              noticeHours: config.rescheduleNoticeHours,
              overrideRequested: input.overridePolicy,
            });
          if (input.overridePolicy && !validOverrideReason(input.reason)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "La excepción requiere un motivo de al menos 10 caracteres",
            });
          }
          if (!canOverride && exceedsMaximum) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `La reserva ya alcanzó el máximo de ${config.maxReschedules} reagendamientos`,
            });
          }
          if (!canOverride && violatesNotice) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `La política exige reagendar con al menos ${config.rescheduleNoticeHours} horas de anticipación`,
            });
          }
          try {
            const availability = await availabilityForDay(
              tx,
              input.bookingDate
            );
            const slot = availability.slots.find(
              item => item.startTime === input.startTime
            );
            if (!slot) {
              throw new TRPCError({
                code: "CONFLICT",
                message:
                  "El horario seleccionado no está habilitado para Sauna",
              });
            }
            const endTime = slot.endTime;
            await assertCapacity(
              tx,
              {
                date: input.bookingDate,
                startTime: input.startTime,
                endTime,
                capacityUsed: booking.capacityUsed,
              },
              booking.id
            );
            const policyViolations: ReschedulePolicyViolation[] = [];
            if (violatesNotice) {
              policyViolations.push({
                code: "notice",
                noticeHours: config.rescheduleNoticeHours,
              });
            }
            if (exceedsMaximum) {
              policyViolations.push({
                code: "maximum_reschedules",
                maxReschedules: config.maxReschedules,
              });
            }
            const auditLine = buildRescheduleAuditLine({
              from: {
                date: serializeDate(booking.bookingDate),
                time: booking.startTime,
              },
              to: {
                date: input.bookingDate,
                time: input.startTime,
              },
              reason: input.reason,
              actor: ctx.user,
              policyOverride: canOverride,
              policyViolations,
            });
            await tx
              .update(saunaBookings)
              .set({
                bookingDate: input.bookingDate,
                startTime: input.startTime,
                endTime,
                rescheduleCount: booking.rescheduleCount + 1,
                notes: appendRescheduleAuditLine(booking.notes, auditLine),
              })
              .where(eq(saunaBookings.id, booking.id));
            return { success: true };
          } finally {
            await releaseCapacityLock(tx, input.bookingDate);
          }
        });
      }),
  }),

  blocks: router({
    list: protectedProcedure
      .input(z.object({ from: dateSchema, to: dateSchema }))
      .query(async ({ ctx, input }) => {
        requirePermission(ctx.user, "module.sauna");
        return (await database())
          .select()
          .from(saunaBlocks)
          .where(
            and(
              gte(saunaBlocks.blockDate, input.from),
              lte(saunaBlocks.blockDate, input.to)
            )
          )
          .orderBy(asc(saunaBlocks.blockDate), asc(saunaBlocks.startTime));
      }),
    create: protectedProcedure
      .input(
        z.object({
          blockDate: dateSchema,
          startTime: timeSchema,
          endTime: timeSchema,
          blockedCapacity: z.number().int().min(1).max(6),
          reason: z.enum([
            "maintenance",
            "private_event",
            "detox",
            "operational",
            "other",
          ]),
          notes: z.string().max(4000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "sauna.manage_blocks");
        if (input.startTime >= input.endTime)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "La hora de término debe ser posterior al inicio",
          });
        const db = await database();
        return db.transaction(async tx => {
          await acquireCapacityLock(tx, input.blockDate);
          await assertCapacity(tx, {
            date: input.blockDate,
            startTime: input.startTime,
            endTime: input.endTime,
            capacityUsed: input.blockedCapacity,
          });
          const [created] = await tx
            .insert(saunaBlocks)
            .values({
              ...input,
              notes: input.notes || null,
              createdByUserId: ctx.user.id,
            })
            .$returningId();
          return created;
        });
      }),
    setActive: protectedProcedure
      .input(z.object({ id: z.number(), active: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "sauna.manage_blocks");
        const db = await database();
        if (!input.active) {
          await db
            .update(saunaBlocks)
            .set({ active: 0 })
            .where(eq(saunaBlocks.id, input.id));
          return { success: true };
        }
        const [existing] = await db
          .select()
          .from(saunaBlocks)
          .where(eq(saunaBlocks.id, input.id))
          .limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
        if (existing.active) return { success: true };
        return db.transaction(async tx => {
          await acquireCapacityLock(tx, serializeDate(existing.blockDate));
          const [block] = await tx
            .select()
            .from(saunaBlocks)
            .where(eq(saunaBlocks.id, input.id))
            .limit(1);
          if (!block) throw new TRPCError({ code: "NOT_FOUND" });
          if (!block.active) {
            await assertCapacity(tx, {
              date: serializeDate(block.blockDate),
              startTime: block.startTime,
              endTime: block.endTime,
              capacityUsed: block.blockedCapacity,
            });
          }
          await tx
            .update(saunaBlocks)
            .set({ active: 1 })
            .where(eq(saunaBlocks.id, input.id));
          return { success: true };
        });
      }),
  }),

  programs: router({
    pending: protectedProcedure.query(async ({ ctx }) => {
      requirePermission(ctx.user, "module.sauna");
      return (await database())
        .select()
        .from(saunaProgramQueue)
        .where(eq(saunaProgramQueue.status, "pending"))
        .orderBy(asc(saunaProgramQueue.programStartsAt));
    }),
    schedule: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          bookingDate: dateSchema,
          startTime: timeSchema,
          notes: z.string().max(2000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "sauna.manage_agenda");
        const db = await database();
        return db.transaction(async tx => {
          await acquireCapacityLock(tx, input.bookingDate);
          const [program] = await tx
            .select()
            .from(saunaProgramQueue)
            .where(eq(saunaProgramQueue.id, input.id))
            .limit(1);
          if (!program) throw new TRPCError({ code: "NOT_FOUND" });
          if (program.status !== "pending")
            throw new TRPCError({
              code: "CONFLICT",
              message: "Este pase ya fue procesado",
            });
          try {
            const endTime = addMinutesToTime(input.startTime, 60);
            await assertCapacity(tx, {
              date: input.bookingDate,
              startTime: input.startTime,
              endTime,
              capacityUsed: program.guests,
            });
            const [created] = await tx
              .insert(saunaBookings)
              .values({
                bookingCode: buildBookingCode("DTX", input.bookingDate),
                skeduGroupUuid: program.skeduGroupUuid,
                skeduUserUuid: program.skeduUserUuid,
                skeduServiceUuid: program.skeduServiceUuid,
                serviceName: program.serviceName,
                kind: "detox",
                clientName: program.clientName,
                clientEmail: program.clientEmail,
                clientPhone: program.clientPhone,
                bookingDate: input.bookingDate,
                startTime: input.startTime,
                endTime,
                guests: program.guests,
                capacityUsed: program.guests,
                status: "confirmed",
                isConfirmed: 1,
                source: "detox",
                origin: "skedu_program",
                notes: input.notes || `Cupo vinculado a ${program.serviceName}`,
                createdByUserId: ctx.user.id,
              })
              .$returningId();
            await tx
              .update(saunaProgramQueue)
              .set({ status: "scheduled", saunaBookingId: created.id })
              .where(eq(saunaProgramQueue.id, program.id));
            return created;
          } finally {
            await releaseCapacityLock(tx, input.bookingDate);
          }
        });
      }),
    dismiss: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "sauna.manage_agenda");
        await (await database())
          .update(saunaProgramQueue)
          .set({ status: "dismissed" })
          .where(eq(saunaProgramQueue.id, input.id));
        return { success: true };
      }),
  }),

  sync: router({
    status: protectedProcedure.query(async ({ ctx }) => {
      requirePermission(ctx.user, "module.sauna");
      return (await database())
        .select()
        .from(saunaSyncRuns)
        .orderBy(desc(saunaSyncRuns.startedAt))
        .limit(20);
    }),
    run: protectedProcedure
      .input(z.object({ from: dateSchema, to: dateSchema }))
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "sauna.manage_sync");
        return syncSaunaFromSkedu(input.from, input.to);
      }),
  }),

  public: router({
    catalog: publicProcedure.query(async () => {
      const db = await database();
      const config = await settings(db);
      const syncedServices = config.checkoutEnabled
        ? await db
            .select({
              id: saunaServices.id,
              name: saunaServices.name,
              kind: saunaServices.kind,
              partySize: saunaServices.partySize,
              priceClp: saunaServices.priceClp,
              durationMinutes: saunaServices.durationMinutes,
            })
            .from(saunaServices)
            .where(
              and(
                eq(saunaServices.published, 1),
                inArray(saunaServices.kind, ["shared", "private"])
              )
            )
            .orderBy(asc(saunaServices.partySize))
        : [];
      const privateService = syncedServices.find(
        service => service.kind === "private"
      );
      const services = syncedServices.map(service => ({
        ...service,
        purchaseKey: `${service.id}:${service.partySize}`,
        fixedPartySize:
          service.kind !== "private" ||
          (service.partySize >= 4 &&
            service.partySize <= 5 &&
            !/privad/i.test(service.name)),
      }));
      if (privateService) {
        for (const partySize of [4, 5]) {
          if (services.some(service => service.partySize === partySize))
            continue;
          services.push({
            ...privateService,
            name: `Sauna Nativo ${partySize} personas`,
            partySize,
            purchaseKey: `${privateService.id}:${partySize}`,
            fixedPartySize: true,
          });
        }
      }
      services.sort((left, right) => left.partySize - right.partySize);
      return {
        checkoutEnabled: Boolean(config.checkoutEnabled),
        services,
        capacity: SAUNA_CAPACITY,
        policies: {
          bookingLeadHours: config.bookingLeadHours,
          cancellationHours: config.cancellationNoticeHours,
          rescheduleHours: config.rescheduleNoticeHours,
          maxReschedules: config.maxReschedules,
        },
      };
    }),
    availability: publicProcedure
      .input(z.object({ serviceId: z.number(), date: dateSchema }))
      .query(async ({ input }) => {
        const db = await database();
        const config = await settings(db);
        if (!config.checkoutEnabled)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "La venta online de Sauna todavía no está habilitada",
          });
        const [service] = await db
          .select()
          .from(saunaServices)
          .where(
            and(
              eq(saunaServices.id, input.serviceId),
              eq(saunaServices.published, 1)
            )
          )
          .limit(1);
        if (!service) throw new TRPCError({ code: "NOT_FOUND" });
        const result = await availabilityForDay(db, input.date);
        return {
          date: input.date,
          slots: result.slots.filter(
            slot =>
              slot.startTime >= "10:00" &&
              slot.startTime <= "20:00" &&
              hasSaunaBookingLeadTime(
                chileLocalDateTimeToUtc(input.date, slot.startTime),
                config.bookingLeadHours
              ) &&
              (service.kind === "private"
                ? slot.privateAvailable
                : slot.availableSeats >= service.capacityUsed)
          ),
        };
      }),
    availableDates: publicProcedure
      .input(z.object({ serviceId: z.number().int().positive(), month: monthSchema }))
      .query(async ({ input }) => {
        const db = await database();
        const config = await settings(db);
        if (!config.checkoutEnabled) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "La venta online de Sauna todavía no está habilitada" });
        const [service] = await db.select().from(saunaServices).where(and(eq(saunaServices.id, input.serviceId), eq(saunaServices.published, 1))).limit(1);
        if (!service || ["staff", "program"].includes(service.kind)) throw new TRPCError({ code: "NOT_FOUND" });
        const dates = datesInMonth(input.month);
        const from = dates[0];
        const to = dates[dates.length - 1];
        const [bookings, blocks, holds] = await Promise.all([
          db.select().from(saunaBookings).where(and(gte(saunaBookings.bookingDate, from), lte(saunaBookings.bookingDate, to), ne(saunaBookings.status, "cancelled"))),
          db.select().from(saunaBlocks).where(and(gte(saunaBlocks.blockDate, from), lte(saunaBlocks.blockDate, to), eq(saunaBlocks.active, 1))),
          db.select().from(saunaCheckoutOrders).where(and(gte(saunaCheckoutOrders.bookingDate, from), lte(saunaCheckoutOrders.bookingDate, to), inArray(saunaCheckoutOrders.status, ["initiating", "payment_pending"]), gt(saunaCheckoutOrders.expiresAt, new Date()))),
        ]);
        const schedule = parseSchedule(config.scheduleJson);
        const isPrivate = service.kind === "private" || service.partySize >= 4;
        const availableDates = dates.filter(date => {
          const day = schedule[String(dayOfWeek(date))];
          if (!day?.enabled || !day.open || !day.close) return false;
          const occupancy = [
            ...bookings.filter(item => serializeDate(item.bookingDate) === date),
            ...blocks.filter(item => serializeDate(item.blockDate) === date).map(item => ({ ...item, guests: item.blockedCapacity, capacityUsed: item.blockedCapacity, isPrivate: 0 })),
            ...holds.filter(item => serializeDate(item.bookingDate) === date),
          ];
          return buildSaunaSlots(day.open, day.close, config.slotIntervalMinutes, config.durationMinutes).some(slot => {
            if (slot.startTime < "10:00" || slot.startTime > "20:00") return false;
            if (!hasSaunaBookingLeadTime(chileLocalDateTimeToUtc(date, slot.startTime), config.bookingLeadHours)) return false;
            const overlapping = occupancy.filter(item => saunaIntervalsOverlap(slot.startTime, slot.endTime, item.startTime, item.endTime));
            const available = availableSaunaSeats(overlapping);
            return isPrivate ? available === SAUNA_CAPACITY : available >= service.capacityUsed;
          });
        });
        return { dates: availableDates };
      }),
    startPayment: publicProcedure
      .input(
        z.object({
          serviceId: z.number(),
          clientName: z.string().trim().min(2).max(200),
          clientEmail: z.string().trim().email(),
          clientPhone: z.string().trim().min(8).max(40),
          acquisition: customerAcquisitionSchema,
          bookingDate: dateSchema,
          startTime: timeSchema,
          privateGuestCount: z.number().int().min(1).max(6).optional(),
          acceptedSharedUse: z.literal(true),
          acceptedTerms: z.literal(true),
          giftCardCode: z.string().trim().min(1).max(20).optional(),
          discountCode: z.string().trim().min(1).max(50).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const db = await database();
        const config = await settings(db);
        if (!config.checkoutEnabled)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "La venta online de Sauna todavía no está habilitada",
          });
        const [service] = await db
          .select()
          .from(saunaServices)
          .where(
            and(
              eq(saunaServices.id, input.serviceId),
              eq(saunaServices.published, 1)
            )
          )
          .limit(1);
        if (!service || service.kind === "staff" || service.kind === "program")
          throw new TRPCError({ code: "NOT_FOUND" });
        const isPrivate = service.kind === "private" || service.partySize >= 4;
        const guests = isPrivate
          ? (input.privateGuestCount ?? SAUNA_CAPACITY)
          : service.partySize;
        const partyError = validateSaunaParty(guests, isPrivate);
        if (partyError)
          throw new TRPCError({ code: "BAD_REQUEST", message: partyError });
        if (input.startTime < "10:00" || input.startTime > "20:00")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Elige un horario entre las 10:00 y las 20:00",
          });
        if (
          !hasSaunaBookingLeadTime(
            chileLocalDateTimeToUtc(input.bookingDate, input.startTime),
            config.bookingLeadHours
          )
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `La reserva exige al menos ${config.bookingLeadHours} horas de anticipación`,
          });
        let orderId = 0;
        let publicToken = "";
        const normalizedGiftCardCode = input.giftCardCode?.trim().toUpperCase();
        const normalizedDiscountCode = input.discountCode?.trim().toUpperCase();
        // Gift card y código de descuento no se combinan: la gift card paga el
        // total y cierra la orden al instante, así que un descuento encima
        // dejaría el monto cobrado y el registrado en desacuerdo.
        if (normalizedGiftCardCode && normalizedDiscountCode)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No se puede usar una gift card y un código de descuento en la misma reserva",
          });
        // El `as` del inicializador no es decorativo: TypeScript no rastrea las
        // asignaciones hechas dentro del callback de la transacción, así que con
        // un `= null` pelado estrecha la variable a `null` para siempre y todo
        // acceso posterior falla con "Property 'x' does not exist on type
        // 'never'". Anotando el inicializador se conserva la unión declarada.
        type SaunaOrderAmounts = {
          subtotalClp: number;
          discountClp: number;
          discountCodeId: number | null;
          discountCode: string | null;
          totalClp: number;
        };
        let discountOrderFields = null as SaunaOrderAmounts | null;
        await db.transaction(async tx => {
          await acquireCapacityLock(tx, input.bookingDate);
          try {
            const availability = await availabilityForDay(
              tx,
              input.bookingDate
            );
            const slot = availability.slots.find(
              item => item.startTime === input.startTime
            );
            if (
              !slot ||
              slot.availableSeats < service.capacityUsed ||
              (isPrivate && !slot.privateAvailable)
            ) {
              throw new TRPCError({
                code: "CONFLICT",
                message: "Este horario ya no tiene los cupos necesarios",
              });
            }
            publicToken = nanoid(48);
            if (normalizedGiftCardCode) {
              const [card] = await tx
                .select()
                .from(giftCards)
                .where(eq(giftCards.code, normalizedGiftCardCode))
                .limit(1);
              validatePublicGiftCard(card, "sauna", service.priceClp);
            }
            // El código se valida y calcula acá, dentro de la transacción y con
            // el cupo ya tomado: si no aplica, revienta antes de crear la orden.
            const discount = normalizedDiscountCode
              ? await calculateWellnessCartDiscount(tx, normalizedDiscountCode, [
                  {
                    service: "sauna",
                    serviceId: service.id,
                    originalAmount: service.priceClp,
                    bookingDate: input.bookingDate,
                  },
                ])
              : null;
            const orderAmounts = {
              subtotalClp: service.priceClp,
              discountClp: discount?.discountTotal ?? 0,
              discountCodeId: discount?.discountCodeId ?? null,
              discountCode: discount?.code ?? null,
              totalClp: discount?.finalTotal ?? service.priceClp,
            };
            discountOrderFields = orderAmounts;
            const [created] = await tx
              .insert(saunaCheckoutOrders)
              .values({
                publicToken,
                serviceId: service.id,
                clientName: input.clientName,
                clientEmail: input.clientEmail.toLowerCase(),
                clientPhone: input.clientPhone,
                bookingDate: input.bookingDate,
                startTime: input.startTime,
                endTime: slot.endTime,
                guests,
                capacityUsed: service.capacityUsed,
                isPrivate: isPrivate ? 1 : 0,
                subtotalClp: orderAmounts.subtotalClp,
                discountClp: orderAmounts.discountClp,
                discountCodeId: orderAmounts.discountCodeId,
                discountCode: orderAmounts.discountCode,
                totalClp: orderAmounts.totalClp,
                giftCardCode: normalizedGiftCardCode ?? null,
                status: "initiating",
                expiresAt: new Date(Date.now() + 40 * 60_000),
              })
              .$returningId();
            orderId = created.id;
            await saveCustomerPurchaseSurvey(tx, {
              purchaseType: "sauna",
              purchaseId: orderId,
              clientEmail: input.clientEmail,
              acquisition: input.acquisition,
            });
          } finally {
            await releaseCapacityLock(tx, input.bookingDate);
          }
        });
        if (normalizedGiftCardCode) {
          try {
            await finalizeApprovedSaunaOrder(orderId, {
              kind: "gift_card",
              code: normalizedGiftCardCode,
            });
            return {
              paymentRequired: false as const,
              paymentUrl: null,
              token: null,
              orderToken: publicToken,
              resultUrl: saunaResultUrl(publicToken, "pagado"),
            };
          } catch (error) {
            await db
              .update(saunaCheckoutOrders)
              .set({ status: "failed", error: String(error).slice(0, 2000) })
              .where(eq(saunaCheckoutOrders.id, orderId));
            throw error instanceof TRPCError
              ? error
              : new TRPCError({
                  code: "BAD_REQUEST",
                  message:
                    error instanceof Error
                      ? error.message
                      : "No pudimos canjear la Gift Card",
                });
          }
        }
        // Un código que cubre el 100% deja el total en $0 y Webpay no acepta
        // cobrar cero: la orden se cierra igual que con una gift card.
        if (
          discountOrderFields
          && discountOrderFields.subtotalClp > 0
          && discountOrderFields.totalClp === 0
          && discountOrderFields.discountClp === discountOrderFields.subtotalClp
          && discountOrderFields.discountCodeId
        ) {
          try {
            await finalizeApprovedSaunaOrder(orderId, { kind: "discount" });
            return {
              paymentRequired: false as const,
              paymentUrl: null,
              token: null,
              orderToken: publicToken,
              resultUrl: saunaResultUrl(publicToken, "pagado"),
            };
          } catch (error) {
            await db
              .update(saunaCheckoutOrders)
              .set({ status: "failed", error: String(error).slice(0, 2000) })
              .where(eq(saunaCheckoutOrders.id, orderId));
            throw error instanceof TRPCError
              ? error
              : new TRPCError({
                  code: "BAD_REQUEST",
                  message: "No pudimos aplicar el código de descuento",
                });
          }
        }
        const buyOrder = generateSaunaBuyOrder(orderId);
        const sessionId = generateSessionId();
        const origin = (ENV.appUrl || "https://cms.cancagua.cl").replace(
          /\/$/,
          ""
        );
        try {
          const payment = await createTransaction(
            buyOrder,
            sessionId,
            discountOrderFields?.totalClp ?? service.priceClp,
            `${origin}/api/sauna/webpay/return`
          );
          await db
            .update(saunaCheckoutOrders)
            .set({
              status: "payment_pending",
              buyOrder,
              sessionId,
              webpayToken: payment.token,
            })
            .where(eq(saunaCheckoutOrders.id, orderId));
          return {
            paymentRequired: true as const,
            paymentUrl: payment.url,
            token: payment.token,
            orderToken: publicToken,
            resultUrl: null,
          };
        } catch (error) {
          await db
            .update(saunaCheckoutOrders)
            .set({ status: "failed", error: String(error).slice(0, 2000) })
            .where(eq(saunaCheckoutOrders.id, orderId));
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "No pudimos iniciar el pago con Webpay",
          });
        }
      }),
    paymentStatus: publicProcedure
      .input(z.object({ orderToken: z.string().min(20) }))
      .query(async ({ input }) => {
        const db = await database();
        const [order] = await db
          .select()
          .from(saunaCheckoutOrders)
          .where(eq(saunaCheckoutOrders.publicToken, input.orderToken))
          .limit(1);
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });
        const [booking] = order.bookingId
          ? await db
              .select()
              .from(saunaBookings)
              .where(eq(saunaBookings.id, order.bookingId))
              .limit(1)
          : [];
        return {
          status: order.status,
          bookingCode: booking?.bookingCode ?? null,
          date: serializeDate(order.bookingDate),
          startTime: order.startTime,
          guests: order.guests,
          isPrivate: Boolean(order.isPrivate),
          totalClp: order.totalClp,
          clientEmail: order.clientEmail.replace(/^(.{2}).*(@.*)$/, "$1***$2"),
        };
      }),
  }),
});
