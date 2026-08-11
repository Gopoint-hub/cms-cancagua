import { TRPCError } from "@trpc/server";
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
} from "../drizzle/schema";
import {
  addMinutesToTime,
  availableSaunaSeats,
  buildSaunaSlots,
  saunaIntervalsOverlap,
  SAUNA_CAPACITY,
  validateSaunaParty,
} from "../shared/sauna";
import { hasCmsPermission, type CmsPermissionKey } from "../shared/permissions";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { chileLocalDateTimeToUtc } from "./massageNps";
import { syncSaunaFromSkedu } from "./saunaSync";
import {
  createTransaction,
  generateSaunaBuyOrder,
  generateSessionId,
} from "./webpay";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/);
const kindSchema = z.enum(["shared", "private", "staff", "detox", "manual"]);
const statusSchema = z.enum([
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
]);

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

async function settings(executor: any) {
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

async function availabilityForDay(
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

async function acquireCapacityLock(executor: any, date: string): Promise<void> {
  const result = await executor.execute(
    sql`SELECT GET_LOCK(${`sauna:capacity:${date}`}, 10) AS acquired`
  );
  const rows = (result as any)?.[0];
  const acquired = Array.isArray(rows) ? rows[0]?.acquired : rows?.acquired;
  if (Number(acquired) !== 1) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "La disponibilidad está siendo actualizada. Intenta nuevamente.",
    });
  }
}

async function releaseCapacityLock(executor: any, date: string): Promise<void> {
  await executor.execute(sql`SELECT RELEASE_LOCK(${`sauna:capacity:${date}`})`);
}

export const saunaRouter = router({
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    requirePermission(ctx.user, "module.sauna");
    const db = await database();
    const today = chileToday();
    const [bookings, dayAvailability, pendingPrograms, lastSync] =
      await Promise.all([
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
    }
    if (pendingPrograms.length)
      alerts.push({
        type: "detox",
        message: `${pendingPrograms.length} pase(s) Detox aún no tienen horario de sauna`,
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
          notes: z.string().max(4000).optional(),
          isConfirmed: z.boolean().default(true),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "sauna.manage_agenda");
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
                bookingCode: `SAU-${input.bookingDate.replaceAll("-", "")}-${nanoid(6).toUpperCase()}`,
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
                paymentStatus: input.paymentStatus,
                paymentMethod: input.paymentMethod || null,
                amountClp: input.amountClp,
                source: "cms",
                origin: "panel",
                notes: input.notes || null,
                createdByUserId: ctx.user.id,
              })
              .$returningId();
            return created;
          } finally {
            await releaseCapacityLock(tx, input.bookingDate);
          }
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
        const [booking] = await db
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
          const config = await settings(db);
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
        await db
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
      }),
    reschedule: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          bookingDate: dateSchema,
          startTime: timeSchema,
          overridePolicy: z.boolean().default(false),
          reason: z.string().max(1000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "sauna.manage_agenda");
        const db = await database();
        return db.transaction(async tx => {
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
          if (
            !input.overridePolicy &&
            booking.rescheduleCount >= config.maxReschedules
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `La reserva ya alcanzó el máximo de ${config.maxReschedules} reagendamientos`,
            });
          }
          const target = chileLocalDateTimeToUtc(
            input.bookingDate,
            input.startTime
          );
          if (
            !input.overridePolicy &&
            target.getTime() - Date.now() <
              config.rescheduleNoticeHours * 60 * 60_000
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `La política exige reagendar con al menos ${config.rescheduleNoticeHours} horas de anticipación`,
            });
          }
          await acquireCapacityLock(tx, input.bookingDate);
          try {
            const endTime = addMinutesToTime(
              input.startTime,
              config.durationMinutes
            );
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
            await tx
              .update(saunaBookings)
              .set({
                bookingDate: input.bookingDate,
                startTime: input.startTime,
                endTime,
                rescheduleCount: booking.rescheduleCount + 1,
                notes:
                  [
                    booking.notes,
                    input.reason ? `Reagendamiento: ${input.reason}` : null,
                  ]
                    .filter(Boolean)
                    .join("\n") || null,
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
        const [created] = await (
          await database()
        )
          .insert(saunaBlocks)
          .values({
            ...input,
            notes: input.notes || null,
            createdByUserId: ctx.user.id,
          })
          .$returningId();
        return created;
      }),
    setActive: protectedProcedure
      .input(z.object({ id: z.number(), active: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "sauna.manage_blocks");
        await (
          await database()
        )
          .update(saunaBlocks)
          .set({ active: input.active ? 1 : 0 })
          .where(eq(saunaBlocks.id, input.id));
        return { success: true };
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
          await acquireCapacityLock(tx, input.bookingDate);
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
                bookingCode: `DTX-${input.bookingDate.replaceAll("-", "")}-${nanoid(6).toUpperCase()}`,
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
            capacityUsed: SAUNA_CAPACITY,
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
          cancellationHours: 72,
          rescheduleHours: 48,
          maxReschedules: 2,
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
          slots: result.slots.filter(slot =>
            service.kind === "private"
              ? slot.privateAvailable
              : slot.availableSeats >= service.capacityUsed
          ),
        };
      }),
    startPayment: publicProcedure
      .input(
        z.object({
          serviceId: z.number(),
          clientName: z.string().trim().min(2).max(200),
          clientEmail: z.string().trim().email(),
          clientPhone: z.string().trim().min(8).max(40),
          bookingDate: dateSchema,
          startTime: timeSchema,
          privateGuestCount: z.number().int().min(1).max(6).optional(),
          acceptedSharedUse: z.literal(true),
          acceptedTerms: z.literal(true),
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
        if (
          chileLocalDateTimeToUtc(input.bookingDate, input.startTime) <=
          new Date()
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "El horario seleccionado ya pasó",
          });
        let orderId = 0;
        let publicToken = "";
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
                totalClp: service.priceClp,
                status: "initiating",
                expiresAt: new Date(Date.now() + 30 * 60_000),
              })
              .$returningId();
            orderId = created.id;
          } finally {
            await releaseCapacityLock(tx, input.bookingDate);
          }
        });
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
            service.priceClp,
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
            paymentUrl: payment.url,
            token: payment.token,
            orderToken: publicToken,
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
