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
  or,
  sql,
} from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  biopoolBookingActivity,
  biopoolBookings,
  biopoolBlocks,
  biopoolCheckoutItems,
  biopoolCheckoutOrders,
  biopoolNotifications,
  biopoolSchedules,
  biopoolServiceImages,
  biopoolServices,
  biopoolTicketTypes,
  clients,
  giftCards,
  giftCardTransactions,
  reservationPayments,
} from "../drizzle/schema";
import { hasCmsPermission, type CmsPermissionKey } from "../shared/permissions";
import {
  buildEntrySlots,
  calculateRefundQuote,
  minimumAvailableSeats,
  validateAdultChildQuantities,
} from "../shared/biopoolsCapacity";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { chileLocalDateTimeToUtc } from "./massageNps";
import {
  createTransaction,
  generateBiopoolBuyOrder,
  generateSessionId,
  refundTransaction,
} from "./webpay";
import { ENV } from "./_core/env";
import { calculateWellnessCartDiscount } from "./massageDiscounts";
import {
  biopoolResultUrl,
  finalizeApprovedBiopoolOrder,
  isFullyDiscountedBiopoolOrder,
  parseClientServicesUsed,
} from "./biopoolWebpay";
import { buildBiopoolNotificationSchedule } from "./biopoolNotifications";
import {
  canRedeemGiftCard,
  validateGiftCardRedemption,
  validateServiceGiftCardRedemption,
} from "./giftCardRedemption";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/);
const manualPaymentMethodSchema = z.enum([
  "payment_link",
  "bank_transfer",
  "cash",
  "transbank_machine",
  "gift_card",
]);
const manualPaymentSchema = z.object({
  method: manualPaymentMethodSchema,
  status: z.enum(["pending", "paid"]),
  amountClp: z.number().int().positive(),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional(),
  reference: z.string().trim().max(160).optional(),
  cardType: z.enum(["credit", "debit"]).optional(),
  giftCardCode: z.string().trim().min(1).max(20).optional(),
});

function validateManualPayment(payment: z.infer<typeof manualPaymentSchema>): void {
  if (payment.method === "gift_card" && payment.status !== "paid") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Una Gift Card canjeada debe registrarse como pagada" });
  }
  if (payment.method === "gift_card" && !payment.giftCardCode) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Ingresa el código de la Gift Card" });
  }
  if (payment.status === "paid" && !payment.paidAt) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Ingresa la fecha y hora del pago" });
  }
  if (payment.status === "paid" && payment.method !== "cash" && payment.method !== "gift_card" && !payment.reference) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Ingresa el código o referencia del pago" });
  }
  if (payment.status === "paid" && ["payment_link", "transbank_machine"].includes(payment.method) && !payment.cardType) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Indica si la tarjeta es de crédito o débito" });
  }
}

function paymentDate(value?: string): Date | null {
  if (!value) return null;
  const [date, time] = value.split("T");
  return chileLocalDateTimeToUtc(date, time);
}

function bookingPaymentStatus(amountPaidClp: number, totalClp: number) {
  if (amountPaidClp <= 0) return "pending" as const;
  if (amountPaidClp < totalClp) return "partially_paid" as const;
  return "paid" as const;
}
const bookingStatuses = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
] as const;

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

function dayOfWeek(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function serializeDate(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function datesInMonth(month: string): string[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const totalDays = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: totalDays }, (_, index) =>
    `${month}-${String(index + 1).padStart(2, "0")}`
  );
}

function hoursUntil(date: string, time: string): number {
  return (
    (chileLocalDateTimeToUtc(date, time).getTime() - Date.now()) / 3_600_000
  );
}

async function availabilityForDay(
  executor: any,
  serviceId: number,
  date: string,
  excludeBookingId?: number,
  excludeCheckoutOrderId?: number
) {
  const [service] = await executor
    .select()
    .from(biopoolServices)
    .where(eq(biopoolServices.id, serviceId))
    .limit(1);
  if (!service || service.status === "archived") {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Servicio de Biopiscinas no encontrado",
    });
  }
  const [schedule] = await executor
    .select()
    .from(biopoolSchedules)
    .where(
      and(
        eq(biopoolSchedules.serviceId, serviceId),
        eq(biopoolSchedules.dayOfWeek, dayOfWeek(date))
      )
    )
    .limit(1);
  if (!schedule?.enabled) return { service, schedule, slots: [] };

  const [bookings, blocks, checkoutHolds] = await Promise.all([
    executor
      .select()
      .from(biopoolBookings)
      .where(
        and(
          eq(biopoolBookings.bookingDate, date),
          inArray(biopoolBookings.status, [
            "pending",
            "confirmed",
            "completed",
          ]),
          excludeBookingId
            ? ne(biopoolBookings.id, excludeBookingId)
            : undefined
        )
      ),
    executor
      .select()
      .from(biopoolBlocks)
      .where(
        and(
          eq(biopoolBlocks.active, 1),
          lte(biopoolBlocks.startDate, date),
          gte(biopoolBlocks.endDate, date)
        )
      ),
    executor
      .select()
      .from(biopoolCheckoutOrders)
      .where(
        and(
          eq(biopoolCheckoutOrders.bookingDate, date),
          inArray(biopoolCheckoutOrders.status, ["initiating", "payment_pending"]),
          gt(biopoolCheckoutOrders.expiresAt, new Date()),
          excludeCheckoutOrderId
            ? ne(biopoolCheckoutOrders.id, excludeCheckoutOrderId)
            : undefined
        )
      ),
  ]);

  const occupancy = [
    ...bookings.map((booking: any) => ({
      startTime: booking.startTime,
      endTime: booking.endTime,
      seats: booking.totalGuests,
      kind: "entry" as const,
    })),
    ...blocks.map((block: any) => ({
      startTime: block.startTime,
      endTime: block.endTime,
      seats: block.blockedCapacity,
      kind: "block" as const,
    })),
    ...checkoutHolds.map((hold: any) => ({
      startTime: hold.startTime,
      endTime: hold.endTime,
      seats: hold.totalGuests,
      kind: "entry" as const,
    })),
  ];
  const slots = buildEntrySlots({
    firstEntryTime: schedule.firstEntryTime,
    lastEntryTime: schedule.lastEntryTime,
    slotIntervalMinutes: service.slotIntervalMinutes,
    standardDurationMinutes: service.standardDurationMinutes,
    finalEntryDurationMinutes: service.finalEntryDurationMinutes,
  }).map(slot => {
    const availableSeats = minimumAvailableSeats(service.capacity, slot, occupancy);
    return { ...slot, availableSeats, occupiedSeats: service.capacity - availableSeats };
  });
  return { service, schedule, slots };
}

async function addActivity(
  executor: any,
  bookingId: number,
  action: string,
  detail: unknown,
  userId?: number
) {
  await executor.insert(biopoolBookingActivity).values({
    bookingId,
    action,
    detail: detail == null ? null : JSON.stringify(detail),
    userId: userId ?? null,
  });
}

async function acquireCapacityLock(
  executor: any,
  lockName: string
): Promise<void> {
  const result = await executor.execute(
    sql`SELECT GET_LOCK(${lockName}, 10) AS acquired`
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

async function releaseCapacityLock(
  executor: any,
  lockName: string
): Promise<void> {
  await executor.execute(sql`SELECT RELEASE_LOCK(${lockName})`);
}

const serviceUpdateSchema = z.object({
  id: z.number(),
  name: z.string().trim().min(3).max(180).optional(),
  description: z.string().optional(),
  status: z.enum(["draft", "published", "hidden", "archived"]).optional(),
  capacity: z.number().int().min(1).max(500).optional(),
  openingTime: timeSchema.optional(),
  waterCloseTime: timeSchema.optional(),
  facilityCloseTime: timeSchema.optional(),
  firstEntryTime: timeSchema.optional(),
  lastEntryTime: timeSchema.optional(),
  slotIntervalMinutes: z.number().int().min(15).max(240).optional(),
  standardDurationMinutes: z.number().int().min(30).max(720).optional(),
  finalEntryDurationMinutes: z.number().int().min(30).max(720).optional(),
  bookingHorizonMonths: z.number().int().min(1).max(120).nullable().optional(),
  maxStaffReschedules: z.number().int().min(0).max(20).optional(),
  refundNoticeHours: z.number().int().min(0).max(720).optional(),
  rescheduleNoticeHours: z.number().int().min(0).max(720).optional(),
  refundFeePercent: z
    .string()
    .regex(/^\d{1,3}(\.\d{1,2})?$/)
    .optional(),
  childMinAge: z.number().int().min(0).max(17).optional(),
  childMaxAge: z.number().int().min(0).max(17).optional(),
  reminderHoursBefore: z.number().int().min(1).max(168).optional(),
  reminderEmailEnabled: z.number().int().min(0).max(1).optional(),
  reminderWhatsappEnabled: z.number().int().min(0).max(1).optional(),
  notificationEmail: z.string().email().optional(),
  mapsUrl: z.string().url().or(z.literal("")).optional(),
  rulesUrl: z.string().url().or(z.literal("")).optional(),
  confirmationEmailSubject: z.string().max(250).optional(),
  confirmationEmailBody: z.string().optional(),
  reminderEmailSubject: z.string().max(250).optional(),
  reminderEmailBody: z.string().optional(),
  reminderWhatsappBody: z.string().optional(),
});

export const biopoolsRouter = router({
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    requirePermission(ctx.user, "module.biopools");
    const db = await database();
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Santiago",
    }).format(new Date());
    const services = await db
      .select()
      .from(biopoolServices)
      .where(ne(biopoolServices.status, "archived"))
      .orderBy(biopoolServices.id);
    if (!services.length)
      return {
        service: null,
        services: [],
        today,
        bookings: 0,
        guests: 0,
        revenueClp: 0,
        pendingPayment: 0,
        confirmed: 0,
        capacity: 0,
        slots: [],
      };
    const bookings = await db
      .select()
      .from(biopoolBookings)
      .where(
        and(
          eq(biopoolBookings.bookingDate, today),
          ne(biopoolBookings.status, "cancelled")
        )
      );
    const availability = await Promise.all(
      services.map(service => availabilityForDay(db, service.id, today))
    );
    const slots = availability.flatMap(result =>
      result.slots.map(slot => ({
        ...slot,
        serviceId: result.service.id,
        serviceName: result.service.name,
        serviceSlug: result.service.slug,
        capacity: result.service.capacity,
      }))
    );
    return {
      service: services[0],
      services,
      today,
      bookings: bookings.length,
      guests: bookings.reduce((sum, item) => sum + item.totalGuests, 0),
      revenueClp: bookings
        .filter(item => item.paymentStatus === "paid")
        .reduce((sum, item) => sum + item.amountPaidClp, 0),
      pendingPayment: bookings.filter(item => item.paymentStatus === "pending")
        .length,
      confirmed: bookings.filter(item => item.status === "confirmed").length,
      capacity: Math.max(...services.map(service => service.capacity)),
      slots,
    };
  }),

  services: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      requirePermission(ctx.user, "module.biopools");
      const db = await database();
      return db
        .select()
        .from(biopoolServices)
        .orderBy(desc(biopoolServices.createdAt));
    }),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        requirePermission(ctx.user, "module.biopools");
        const db = await database();
        const [service] = await db
          .select()
          .from(biopoolServices)
          .where(eq(biopoolServices.id, input.id))
          .limit(1);
        if (!service) throw new TRPCError({ code: "NOT_FOUND" });
        const [tickets, schedules, images] = await Promise.all([
          db
            .select()
            .from(biopoolTicketTypes)
            .where(eq(biopoolTicketTypes.serviceId, input.id))
            .orderBy(asc(biopoolTicketTypes.displayOrder)),
          db
            .select()
            .from(biopoolSchedules)
            .where(eq(biopoolSchedules.serviceId, input.id))
            .orderBy(asc(biopoolSchedules.dayOfWeek)),
          db
            .select()
            .from(biopoolServiceImages)
            .where(eq(biopoolServiceImages.serviceId, input.id))
            .orderBy(asc(biopoolServiceImages.displayOrder)),
        ]);
        return { service, tickets, schedules, images };
      }),
    update: protectedProcedure
      .input(serviceUpdateSchema)
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "biopools.manage_settings");
        const db = await database();
        const { id, mapsUrl, rulesUrl, ...values } = input;
        await db
          .update(biopoolServices)
          .set({
            ...values,
            mapsUrl: mapsUrl === "" ? null : mapsUrl,
            rulesUrl: rulesUrl === "" ? null : rulesUrl,
          })
          .where(eq(biopoolServices.id, id));
        if (values.capacity !== undefined) {
          await db
            .update(biopoolServices)
            .set({ capacity: values.capacity })
            .where(ne(biopoolServices.status, "archived"));
        }
        const scheduleValues = {
          ...(values.openingTime ? { openingTime: values.openingTime } : {}),
          ...(values.firstEntryTime ? { firstEntryTime: values.firstEntryTime } : {}),
          ...(values.lastEntryTime ? { lastEntryTime: values.lastEntryTime } : {}),
          ...(values.waterCloseTime ? { waterCloseTime: values.waterCloseTime } : {}),
          ...(values.facilityCloseTime ? { facilityCloseTime: values.facilityCloseTime } : {}),
        };
        if (Object.keys(scheduleValues).length) {
          await db.update(biopoolSchedules).set(scheduleValues).where(eq(biopoolSchedules.serviceId, id));
        }
        return { success: true };
      }),
    duplicate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "biopools.manage_catalog");
        const db = await database();
        return db.transaction(async tx => {
          const [source] = await tx
            .select()
            .from(biopoolServices)
            .where(eq(biopoolServices.id, input.id))
            .limit(1);
          if (!source) throw new TRPCError({ code: "NOT_FOUND" });
          const {
            id: _id,
            slug,
            createdAt: _created,
            updatedAt: _updated,
            archivedAt: _archived,
            ...copy
          } = source;
          const [created] = await tx
            .insert(biopoolServices)
            .values({
              ...copy,
              name: `${source.name} — copia`,
              slug: `${slug}-copia-${nanoid(5).toLowerCase()}`,
              status: "draft",
              createdByUserId: ctx.user.id,
            })
            .$returningId();
          const [tickets, schedules, images] = await Promise.all([
            tx
              .select()
              .from(biopoolTicketTypes)
              .where(eq(biopoolTicketTypes.serviceId, source.id)),
            tx
              .select()
              .from(biopoolSchedules)
              .where(eq(biopoolSchedules.serviceId, source.id)),
            tx
              .select()
              .from(biopoolServiceImages)
              .where(eq(biopoolServiceImages.serviceId, source.id)),
          ]);
          if (tickets.length)
            await tx
              .insert(biopoolTicketTypes)
              .values(
                tickets.map(({ id, createdAt, updatedAt, ...row }) => ({
                  ...row,
                  serviceId: created.id,
                }))
              );
          if (schedules.length)
            await tx
              .insert(biopoolSchedules)
              .values(
                schedules.map(({ id, createdAt, updatedAt, ...row }) => ({
                  ...row,
                  serviceId: created.id,
                }))
              );
          if (images.length)
            await tx
              .insert(biopoolServiceImages)
              .values(
                images.map(({ id, createdAt, ...row }) => ({
                  ...row,
                  serviceId: created.id,
                }))
              );
          return { id: created.id };
        });
      }),
    remove: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin")
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Solo un superadministrador puede eliminar servicios",
          });
        const db = await database();
        const [booking] = await db
          .select({ id: biopoolBookings.id })
          .from(biopoolBookings)
          .where(eq(biopoolBookings.serviceId, input.id))
          .limit(1);
        if (booking) {
          await db
            .update(biopoolServices)
            .set({ status: "archived", archivedAt: new Date() })
            .where(eq(biopoolServices.id, input.id));
          return { archived: true };
        }
        await db.transaction(async tx => {
          await tx
            .delete(biopoolTicketTypes)
            .where(eq(biopoolTicketTypes.serviceId, input.id));
          await tx
            .delete(biopoolSchedules)
            .where(eq(biopoolSchedules.serviceId, input.id));
          await tx
            .delete(biopoolServiceImages)
            .where(eq(biopoolServiceImages.serviceId, input.id));
          await tx
            .delete(biopoolBlocks)
            .where(eq(biopoolBlocks.serviceId, input.id));
          await tx
            .delete(biopoolServices)
            .where(eq(biopoolServices.id, input.id));
        });
        return { archived: false };
      }),
    uploadImage: protectedProcedure
      .input(
        z.object({
          serviceId: z.number(),
          imageData: z.string(),
          mimeType: z.string().regex(/^image\//),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "biopools.manage_catalog");
        const match = input.imageData.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!match)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Formato de imagen inválido",
          });
        if (Buffer.byteLength(match[2], "base64") > 8 * 1024 * 1024) {
          throw new TRPCError({
            code: "PAYLOAD_TOO_LARGE",
            message: "La imagen no puede superar 8 MB",
          });
        }
        const extension =
          match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
        const { storagePut } = await import("./storage");
        const { url } = await storagePut(
          `biopiscinas/${input.serviceId}/${Date.now()}-${nanoid(6)}.${extension}`,
          Buffer.from(match[2], "base64"),
          input.mimeType
        );
        const db = await database();
        const images = await db
          .select()
          .from(biopoolServiceImages)
          .where(eq(biopoolServiceImages.serviceId, input.serviceId));
        const [created] = await db
          .insert(biopoolServiceImages)
          .values({
            serviceId: input.serviceId,
            url,
            displayOrder: images.length,
          })
          .$returningId();
        return { id: created.id, url };
      }),
    deleteImage: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "biopools.manage_catalog");
        const db = await database();
        await db
          .delete(biopoolServiceImages)
          .where(eq(biopoolServiceImages.id, input.id));
        return { success: true };
      }),
  }),

  tickets: router({
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().trim().min(2).max(120),
          priceClp: z.number().int().min(0),
          active: z.number().int().min(0).max(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "biopools.manage_catalog");
        const db = await database();
        const { id, ...values } = input;
        await db
          .update(biopoolTicketTypes)
          .set(values)
          .where(eq(biopoolTicketTypes.id, id));
        return { success: true };
      }),
  }),

  schedules: router({
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          enabled: z.number().int().min(0).max(1),
          openingTime: timeSchema,
          firstEntryTime: timeSchema,
          lastEntryTime: timeSchema,
          waterCloseTime: timeSchema,
          facilityCloseTime: timeSchema,
        })
      )
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "biopools.manage_settings");
        const db = await database();
        const { id, ...values } = input;
        await db
          .update(biopoolSchedules)
          .set(values)
          .where(eq(biopoolSchedules.id, id));
        return { success: true };
      }),
  }),

  availability: router({
    day: protectedProcedure
      .input(z.object({ serviceId: z.number(), date: dateSchema }))
      .query(async ({ ctx, input }) => {
        requirePermission(ctx.user, "module.biopools");
        return availabilityForDay(
          await database(),
          input.serviceId,
          input.date
        );
      }),
    all: protectedProcedure
      .input(z.object({ date: dateSchema }))
      .query(async ({ ctx, input }) => {
        requirePermission(ctx.user, "module.biopools");
        const db = await database();
        const services = await db
          .select({ id: biopoolServices.id })
          .from(biopoolServices)
          .where(ne(biopoolServices.status, "archived"))
          .orderBy(asc(biopoolServices.id));
        return Promise.all(
          services.map(service => availabilityForDay(db, service.id, input.date))
        );
      }),
  }),

  public: router({
    catalog: publicProcedure.query(async () => {
      const db = await database();
      const services = await db
        .select()
        .from(biopoolServices)
        .where(eq(biopoolServices.status, "published"))
        .orderBy(asc(biopoolServices.id));
      if (!services.length) throw new TRPCError({ code: "NOT_FOUND", message: "Biopiscinas no está disponible" });
      const catalogs = await Promise.all(services.map(async service => {
        const [tickets, images] = await Promise.all([
          db.select().from(biopoolTicketTypes).where(and(eq(biopoolTicketTypes.serviceId, service.id), eq(biopoolTicketTypes.active, 1))).orderBy(asc(biopoolTicketTypes.displayOrder)),
          db.select().from(biopoolServiceImages).where(eq(biopoolServiceImages.serviceId, service.id)).orderBy(asc(biopoolServiceImages.displayOrder)),
        ]);
        return { service, tickets, images };
      }));
      const primary = catalogs.find(item => item.service.slug === "biopiscinas-geotermales") ?? catalogs[0];
      return { ...primary, services: catalogs };
    }),
    availability: publicProcedure
      .input(z.object({
        serviceId: z.number(),
        date: dateSchema,
        guestCount: z.number().int().min(1).max(40).default(1),
      }))
      .query(async ({ input }) => {
        const result = await availabilityForDay(await database(), input.serviceId, input.date);
        if (result.service.status !== "published") throw new TRPCError({ code: "NOT_FOUND" });
        const now = new Date();
        return {
          slots: result.slots
            .filter(slot =>
              chileLocalDateTimeToUtc(input.date, slot.startTime) > now &&
              slot.availableSeats >= input.guestCount
            )
            .map(slot => ({ startTime: slot.startTime, endTime: slot.endTime })),
        };
      }),
    availableDates: publicProcedure
      .input(z.object({
        serviceId: z.number().int().positive(),
        month: monthSchema,
        guestCount: z.number().int().min(1).max(40),
      }))
      .query(async ({ input }) => {
        const db = await database();
        const dates = datesInMonth(input.month);
        const from = dates[0];
        const to = dates[dates.length - 1];
        const [service] = await db
          .select()
          .from(biopoolServices)
          .where(eq(biopoolServices.id, input.serviceId))
          .limit(1);
        if (!service || service.status !== "published") {
          throw new TRPCError({ code: "NOT_FOUND", message: "El servicio no está publicado" });
        }

        const [schedules, bookings, blocks, checkoutHolds] = await Promise.all([
          db
            .select()
            .from(biopoolSchedules)
            .where(eq(biopoolSchedules.serviceId, input.serviceId)),
          db
            .select()
            .from(biopoolBookings)
            .where(and(
              gte(biopoolBookings.bookingDate, from),
              lte(biopoolBookings.bookingDate, to),
              inArray(biopoolBookings.status, ["pending", "confirmed", "completed"])
            )),
          db
            .select()
            .from(biopoolBlocks)
            .where(and(
              eq(biopoolBlocks.active, 1),
              lte(biopoolBlocks.startDate, to),
              gte(biopoolBlocks.endDate, from)
            )),
          db
            .select()
            .from(biopoolCheckoutOrders)
            .where(and(
              gte(biopoolCheckoutOrders.bookingDate, from),
              lte(biopoolCheckoutOrders.bookingDate, to),
              inArray(biopoolCheckoutOrders.status, ["initiating", "payment_pending"]),
              gt(biopoolCheckoutOrders.expiresAt, new Date())
            )),
        ]);

        const now = new Date();
        const availableDates = dates.filter(date => {
          const schedule = schedules.find(item => item.dayOfWeek === dayOfWeek(date));
          if (!schedule?.enabled) return false;
          const occupancy = [
            ...bookings
              .filter(booking => serializeDate(booking.bookingDate) === date)
              .map(booking => ({ startTime: booking.startTime, endTime: booking.endTime, seats: booking.totalGuests, kind: "entry" as const })),
            ...blocks
              .filter(block => serializeDate(block.startDate) <= date && serializeDate(block.endDate) >= date)
              .map(block => ({ startTime: block.startTime, endTime: block.endTime, seats: block.blockedCapacity, kind: "block" as const })),
            ...checkoutHolds
              .filter(hold => serializeDate(hold.bookingDate) === date)
              .map(hold => ({ startTime: hold.startTime, endTime: hold.endTime, seats: hold.totalGuests, kind: "entry" as const })),
          ];
          return buildEntrySlots({
            firstEntryTime: schedule.firstEntryTime,
            lastEntryTime: schedule.lastEntryTime,
            slotIntervalMinutes: service.slotIntervalMinutes,
            standardDurationMinutes: service.standardDurationMinutes,
            finalEntryDurationMinutes: service.finalEntryDurationMinutes,
          }).some(slot =>
            chileLocalDateTimeToUtc(date, slot.startTime) > now &&
            minimumAvailableSeats(service.capacity, slot, occupancy) >= input.guestCount
          );
        });

        return { dates: availableDates };
      }),
    validateDiscount: publicProcedure
      .input(z.object({
        serviceId: z.number(),
        adultQuantity: z.number().int().min(1).max(40),
        childQuantity: z.number().int().min(0).max(40),
        code: z.string().trim().min(1).max(50),
      }))
      .mutation(async ({ input }) => {
        const db = await database();
        const tickets = await db.select().from(biopoolTicketTypes).where(and(eq(biopoolTicketTypes.serviceId, input.serviceId), eq(biopoolTicketTypes.active, 1)));
        const adult = tickets.find(ticket => ticket.code === "adult");
        const child = tickets.find(ticket => ticket.code === "child");
        if (!adult || (input.childQuantity > 0 && !child)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "La venta de tickets no está configurada" });
        try {
          return await calculateWellnessCartDiscount(db, input.code, [{
            service: "biopiscinas",
            serviceId: input.serviceId,
            originalAmount: adult.priceClp * input.adultQuantity + (child?.priceClp ?? 0) * input.childQuantity,
          }]);
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "El código no es válido" });
        }
      }),
    startPayment: publicProcedure
      .input(z.object({
        serviceId: z.number(),
        clientName: z.string().trim().min(2).max(200),
        clientEmail: z.string().trim().email(),
        clientPhone: z.string().trim().min(8).max(40),
        bookingDate: dateSchema,
        startTime: timeSchema,
        adultQuantity: z.number().int().min(1).max(40),
        childQuantity: z.number().int().min(0).max(40),
        discountCode: z.string().trim().max(50).optional(),
        acceptedTerms: z.literal(true),
        utmSource: z.string().max(100).optional(),
        utmMedium: z.string().max(100).optional(),
        utmCampaign: z.string().max(100).optional(),
      }))
      .mutation(async ({ input }) => {
        if (chileLocalDateTimeToUtc(input.bookingDate, input.startTime) <= new Date())
          throw new TRPCError({ code: "BAD_REQUEST", message: "El horario seleccionado ya pasó" });
        const quantityError = validateAdultChildQuantities(input.adultQuantity, input.childQuantity);
        if (quantityError) throw new TRPCError({ code: "BAD_REQUEST", message: quantityError });
        const db = await database();
        let orderId = 0;
        let publicToken = "";
        let totalClp = 0;
        let subtotalClpForOrder = 0;
        let discountClpForOrder = 0;
        let discountCodeIdForOrder: number | null = null;
        const lockName = `biopool:shared:${input.bookingDate}`;
        await db.transaction(async tx => {
          await acquireCapacityLock(tx, lockName);
          try {
            const availability = await availabilityForDay(tx, input.serviceId, input.bookingDate);
            if (availability.service.status !== "published") throw new TRPCError({ code: "NOT_FOUND", message: "El servicio no está publicado" });
            const slot = availability.slots.find((item: any) => item.startTime === input.startTime);
            if (!slot) throw new TRPCError({ code: "BAD_REQUEST", message: "El horario seleccionado no está disponible" });
            const totalGuests = input.adultQuantity + input.childQuantity;
            if (slot.availableSeats < totalGuests) throw new TRPCError({ code: "CONFLICT", message: "Este horario ya no está disponible para la cantidad de personas seleccionada" });
            const tickets = await tx.select().from(biopoolTicketTypes).where(and(eq(biopoolTicketTypes.serviceId, input.serviceId), eq(biopoolTicketTypes.active, 1)));
            const adult = tickets.find((ticket: any) => ticket.code === "adult");
            const child = tickets.find((ticket: any) => ticket.code === "child");
            if (!adult || (input.childQuantity > 0 && !child)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "La venta de tickets no está configurada" });
            const subtotalClp = adult.priceClp * input.adultQuantity + (child?.priceClp ?? 0) * input.childQuantity;
            let discount: Awaited<ReturnType<typeof calculateWellnessCartDiscount>> | null = null;
            if (input.discountCode) {
              try {
                discount = await calculateWellnessCartDiscount(tx, input.discountCode, [{ service: "biopiscinas", serviceId: input.serviceId, originalAmount: subtotalClp }]);
              } catch (error) {
                throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "El código no es válido" });
              }
            }
            totalClp = discount?.finalTotal ?? subtotalClp;
            subtotalClpForOrder = subtotalClp;
            discountClpForOrder = discount?.discountTotal ?? 0;
            discountCodeIdForOrder = discount?.discountCodeId ?? null;
            publicToken = nanoid(48);
            const [created] = await tx.insert(biopoolCheckoutOrders).values({
              publicToken,
              serviceId: input.serviceId,
              clientName: input.clientName,
              clientEmail: input.clientEmail.toLowerCase(),
              clientPhone: input.clientPhone,
              bookingDate: input.bookingDate,
              startTime: input.startTime,
              endTime: slot.endTime,
              adultQuantity: input.adultQuantity,
              childQuantity: input.childQuantity,
              totalGuests,
              subtotalClp,
              discountClp: discount?.discountTotal ?? 0,
              discountCodeId: discount?.discountCodeId ?? null,
              discountCode: discount?.code ?? null,
              totalClp,
              status: "initiating",
              expiresAt: new Date(Date.now() + 30 * 60_000),
              utmSource: input.utmSource ?? null,
              utmMedium: input.utmMedium ?? null,
              utmCampaign: input.utmCampaign ?? null,
            }).$returningId();
            orderId = created.id;
            await tx.insert(biopoolCheckoutItems).values([
              { orderId, ticketTypeId: adult.id, code: adult.code, name: adult.name, unitPriceClp: adult.priceClp, quantity: input.adultQuantity, subtotalClp: adult.priceClp * input.adultQuantity },
              ...(input.childQuantity > 0 && child ? [{ orderId, ticketTypeId: child.id, code: child.code, name: child.name, unitPriceClp: child.priceClp, quantity: input.childQuantity, subtotalClp: child.priceClp * input.childQuantity }] : []),
            ]);
          } finally {
            await releaseCapacityLock(tx, lockName);
          }
        });
        if (isFullyDiscountedBiopoolOrder({
          subtotalClp: subtotalClpForOrder,
          discountClp: discountClpForOrder,
          totalClp,
          discountCodeId: discountCodeIdForOrder,
        })) {
          try {
            await finalizeApprovedBiopoolOrder(orderId, { kind: "discount" });
            return {
              paymentRequired: false as const,
              paymentUrl: null,
              token: null,
              orderToken: publicToken,
              resultUrl: biopoolResultUrl(publicToken, "pagado"),
            };
          } catch (error) {
            console.error("[biopools:checkout] No se pudo confirmar una reserva cubierta por descuento", {
              orderId,
              error,
            });
            await db.update(biopoolCheckoutOrders)
              .set({ status: "failed", error: String(error).slice(0, 2000) })
              .where(eq(biopoolCheckoutOrders.id, orderId));
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No pudimos confirmar la reserva. Intenta nuevamente." });
          }
        }
        const buyOrder = generateBiopoolBuyOrder(orderId);
        const sessionId = generateSessionId();
        const origin = (ENV.appUrl || "https://cms.cancagua.cl").replace(/\/$/, "");
        try {
          const payment = await createTransaction(buyOrder, sessionId, totalClp, `${origin}/api/biopiscinas/webpay/return`);
          await db.update(biopoolCheckoutOrders).set({ status: "payment_pending", buyOrder, sessionId, webpayToken: payment.token }).where(eq(biopoolCheckoutOrders.id, orderId));
          return {
            paymentRequired: true as const,
            paymentUrl: payment.url,
            token: payment.token,
            orderToken: publicToken,
            resultUrl: null,
          };
        } catch (error) {
          await db.update(biopoolCheckoutOrders).set({ status: "failed", error: String(error) }).where(eq(biopoolCheckoutOrders.id, orderId));
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No pudimos iniciar el pago. Intenta nuevamente." });
        }
      }),
    paymentStatus: publicProcedure
      .input(z.object({ orderToken: z.string().min(20) }))
      .query(async ({ input }) => {
        const db = await database();
        const [order] = await db.select().from(biopoolCheckoutOrders).where(eq(biopoolCheckoutOrders.publicToken, input.orderToken)).limit(1);
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });
        return {
          status: order.status,
          bookingCode: order.bookingId ? (await db.select({ code: biopoolBookings.bookingCode }).from(biopoolBookings).where(eq(biopoolBookings.id, order.bookingId)).limit(1))[0]?.code ?? null : null,
          date: serializeDate(order.bookingDate),
          startTime: order.startTime,
          totalClp: order.totalClp,
          discountClp: order.discountClp,
          discountCode: order.discountCode,
          clientEmail: order.clientEmail.replace(/^(.{2}).*(@.*)$/, "$1***$2"),
        };
      }),
  }),

  sales: router({
    list: protectedProcedure
      .input(z.object({ from: dateSchema.optional(), to: dateSchema.optional() }).optional())
      .query(async ({ ctx, input }) => {
        requirePermission(ctx.user, "module.biopools");
        const db = await database();
        return db.select({ order: biopoolCheckoutOrders, bookingCode: biopoolBookings.bookingCode, serviceName: biopoolServices.name })
          .from(biopoolCheckoutOrders)
          .leftJoin(biopoolBookings, eq(biopoolCheckoutOrders.bookingId, biopoolBookings.id))
          .innerJoin(biopoolServices, eq(biopoolCheckoutOrders.serviceId, biopoolServices.id))
          .where(and(
            input?.from ? sql`DATE(${biopoolCheckoutOrders.createdAt}) >= ${input.from}` : undefined,
            input?.to ? sql`DATE(${biopoolCheckoutOrders.createdAt}) <= ${input.to}` : undefined,
          ))
          .orderBy(desc(biopoolCheckoutOrders.createdAt));
      }),
  }),

  blocks: router({
    list: protectedProcedure
      .input(
        z.object({ serviceId: z.number(), from: dateSchema, to: dateSchema })
      )
      .query(async ({ ctx, input }) => {
        requirePermission(ctx.user, "module.biopools");
        const db = await database();
        return db
          .select()
          .from(biopoolBlocks)
          .where(
            and(
              eq(biopoolBlocks.serviceId, input.serviceId),
              lte(biopoolBlocks.startDate, input.to),
              gte(biopoolBlocks.endDate, input.from)
            )
          )
          .orderBy(desc(biopoolBlocks.startDate));
      }),
    create: protectedProcedure
      .input(
        z.object({
          serviceId: z.number(),
          startDate: dateSchema,
          endDate: dateSchema,
          startTime: timeSchema,
          endTime: timeSchema,
          blockedCapacity: z.number().int().min(1).max(500),
          reason: z.enum([
            "technical",
            "temperature",
            "private_event",
            "maintenance",
            "other",
          ]),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "biopools.manage_blocks");
        if (input.endDate < input.startDate)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "La fecha final no puede ser anterior",
          });
        const db = await database();
        const [created] = await db
          .insert(biopoolBlocks)
          .values({ ...input, createdByUserId: ctx.user.id })
          .$returningId();
        return { id: created.id };
      }),
    remove: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "biopools.manage_blocks");
        const db = await database();
        await db
          .update(biopoolBlocks)
          .set({ active: 0 })
          .where(eq(biopoolBlocks.id, input.id));
        return { success: true };
      }),
  }),

  bookings: router({
    list: protectedProcedure
      .input(
        z.object({ serviceId: z.number().optional(), from: dateSchema, to: dateSchema })
      )
      .query(async ({ ctx, input }) => {
        requirePermission(ctx.user, "module.biopools");
        const db = await database();
        return db
          .select()
          .from(biopoolBookings)
          .where(
            and(
              input.serviceId !== undefined
                ? eq(biopoolBookings.serviceId, input.serviceId)
                : undefined,
              gte(biopoolBookings.bookingDate, input.from),
              lte(biopoolBookings.bookingDate, input.to)
            )
          )
          .orderBy(
            asc(biopoolBookings.bookingDate),
            asc(biopoolBookings.startTime)
          );
      }),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        requirePermission(ctx.user, "module.biopools");
        const db = await database();
        const [booking] = await db
          .select()
          .from(biopoolBookings)
          .where(eq(biopoolBookings.id, input.id))
          .limit(1);
        if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
        const [activity, notifications, payments] = await Promise.all([
          db
            .select()
            .from(biopoolBookingActivity)
            .where(eq(biopoolBookingActivity.bookingId, input.id))
            .orderBy(desc(biopoolBookingActivity.createdAt)),
          db
            .select()
            .from(biopoolNotifications)
            .where(eq(biopoolNotifications.bookingId, input.id))
            .orderBy(desc(biopoolNotifications.createdAt)),
          db
            .select()
            .from(reservationPayments)
            .where(and(eq(reservationPayments.module, "biopools"), eq(reservationPayments.reservationId, input.id)))
            .orderBy(desc(reservationPayments.createdAt)),
        ]);
        return { booking, activity, notifications, payments };
      }),
    create: protectedProcedure
      .input(
        z.object({
          serviceId: z.number(),
          clientName: z.string().trim().min(2).max(200),
          clientEmail: z.string().trim().email(),
          clientPhone: z.string().trim().min(8).max(40),
          bookingDate: dateSchema,
          startTime: timeSchema,
          adultQuantity: z.number().int().min(0).max(40),
          childQuantity: z.number().int().min(0).max(40),
          payments: z.array(manualPaymentSchema).min(1).max(10),
          discountAmountClp: z.number().int().min(0).default(0),
          notes: z.string().optional(),
          source: z.enum(["cms", "web", "skedu_import", "b2b"]).default("cms"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "biopools.manage_agenda");
        if (input.payments.some(payment => payment.method === "gift_card") && !canRedeemGiftCard(ctx.user)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "No tienes permisos para canjear Gift Cards",
          });
        }
        input.payments.forEach(validateManualPayment);
        const quantityError = validateAdultChildQuantities(
          input.adultQuantity,
          input.childQuantity
        );
        if (quantityError)
          throw new TRPCError({ code: "BAD_REQUEST", message: quantityError });
        const db = await database();
        return db.transaction(async tx => {
          const lockName = `biopool:shared:${input.bookingDate}`;
          await acquireCapacityLock(tx, lockName);
          try {
            const availability = await availabilityForDay(
              tx,
              input.serviceId,
              input.bookingDate
            );
            const slot = availability.slots.find(
              (item: any) => item.startTime === input.startTime
            );
            if (!slot)
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "El horario seleccionado no está habilitado",
              });
            const totalGuests = input.adultQuantity + input.childQuantity;
            if (slot.availableSeats < totalGuests) {
              throw new TRPCError({
                code: "CONFLICT",
                message: `Solo quedan ${slot.availableSeats} cupos disponibles para este horario`,
              });
            }
            const tickets = await tx
              .select()
              .from(biopoolTicketTypes)
              .where(
                and(
                  eq(biopoolTicketTypes.serviceId, input.serviceId),
                  eq(biopoolTicketTypes.active, 1)
                )
              );
            const adult = tickets.find(ticket => ticket.code === "adult");
            const child = tickets.find(ticket => ticket.code === "child");
            if (!adult || (input.childQuantity > 0 && !child))
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: "Faltan los tickets requeridos para esta reserva",
              });
            const originalAmountClp =
              adult.priceClp * input.adultQuantity +
              (child?.priceClp ?? 0) * input.childQuantity;
            if (input.discountAmountClp > originalAmountClp)
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "El descuento supera el total",
              });

            const normalizedEmail = input.clientEmail.trim().toLowerCase();
            let [client] = await tx
              .select()
              .from(clients)
              .where(
                or(
                  eq(clients.email, normalizedEmail),
                  eq(clients.phone, input.clientPhone)
                )
              )
              .limit(1);
            if (client) {
              await tx
                .update(clients)
                .set({
                  name: input.clientName,
                  email: normalizedEmail,
                  phone: input.clientPhone,
                })
                .where(eq(clients.id, client.id));
            } else {
              const [createdClient] = await tx
                .insert(clients)
                .values({
                  email: normalizedEmail,
                  name: input.clientName,
                  phone: input.clientPhone,
                  origen: input.source,
                })
                .$returningId();
              [client] = await tx
                .select()
                .from(clients)
                .where(eq(clients.id, createdClient.id))
                .limit(1);
            }

            const totalClp = originalAmountClp - input.discountAmountClp;
            const plannedTotalClp = input.payments.reduce((sum, payment) => sum + payment.amountClp, 0);
            const amountPaidClp = input.payments
              .filter(payment => payment.status === "paid")
              .reduce((sum, payment) => sum + payment.amountClp, 0);
            if (plannedTotalClp > totalClp) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "Los pagos ingresados superan el total de la reserva" });
            }
            const paymentStatus = bookingPaymentStatus(amountPaidClp, totalClp);
            const giftCardPayments: Array<{
              payment: z.infer<typeof manualPaymentSchema>;
              card: typeof giftCards.$inferSelect;
            }> = [];
            for (const payment of input.payments.filter(item => item.method === "gift_card")) {
              const code = payment.giftCardCode!.trim().toUpperCase();
              const [card] = await tx.select().from(giftCards).where(eq(giftCards.code, code)).limit(1);
              if (!card) throw new TRPCError({ code: "BAD_REQUEST", message: `Gift Card ${code} no encontrada` });
              try {
                if (card.amount === 0) {
                  validateServiceGiftCardRedemption({
                    status: card.status,
                    purchaseStatus: card.purchaseStatus,
                    amount: card.amount,
                    expiresAt: card.expiresAt,
                  });
                  if (payment.amountClp !== totalClp) {
                    throw new Error("Una Gift Card de servicio debe cubrir el total completo de la reserva");
                  }
                } else {
                  validateGiftCardRedemption({
                    status: card.status,
                    purchaseStatus: card.purchaseStatus,
                    balance: card.balance,
                    amount: payment.amountClp,
                    expiresAt: card.expiresAt,
                  });
                }
              } catch (error) {
                throw new TRPCError({
                  code: "BAD_REQUEST",
                  message: error instanceof Error ? error.message : "No se pudo validar la Gift Card",
                });
              }
              giftCardPayments.push({ payment, card });
            }

            const [created] = await tx
              .insert(biopoolBookings)
              .values({
                bookingCode: `BIO-${input.bookingDate.replaceAll("-", "")}-${nanoid(6).toUpperCase()}`,
                serviceId: input.serviceId,
                clientId: client.id,
                clientName: input.clientName,
                clientEmail: normalizedEmail,
                clientPhone: input.clientPhone,
                bookingDate: input.bookingDate,
                startTime: input.startTime,
                endTime: slot.endTime,
                adultQuantity: input.adultQuantity,
                childQuantity: input.childQuantity,
                totalGuests,
                status: "confirmed",
                attendanceToken: nanoid(48),
                paymentStatus,
                paymentMethod: input.payments.length === 1 ? input.payments[0].method : "mixed",
                paymentReference: input.payments.length === 1
                  ? (input.payments[0].giftCardCode?.trim().toUpperCase() ?? input.payments[0].reference ?? null)
                  : null,
                originalAmountClp,
                discountAmountClp: input.discountAmountClp,
                amountPaidClp,
                refundFeePercent: availability.service.refundFeePercent,
                source: input.source,
                notes: input.notes ?? null,
                createdByUserId: ctx.user.id,
              })
              .$returningId();

            for (const { payment, card } of giftCardPayments) {
              const redemptionAmount = card.amount === 0 ? 0 : payment.amountClp;
              const newBalance = card.amount === 0 ? 0 : card.balance - redemptionAmount;
              const fullyRedeemed = card.amount === 0 || newBalance === 0;
              const updateResult: any = await tx
                .update(giftCards)
                .set({
                  balance: newBalance,
                  status: fullyRedeemed ? "redeemed" : "active",
                  redeemedAt: fullyRedeemed ? new Date() : null,
                })
                .where(and(
                  eq(giftCards.id, card.id),
                  eq(giftCards.status, "active"),
                  eq(giftCards.purchaseStatus, "completed"),
                  eq(giftCards.balance, card.balance),
                ));
              const affectedRows = Number(
                updateResult?.[0]?.affectedRows ?? updateResult?.affectedRows ?? 0
              );
              if (affectedRows !== 1) {
                throw new TRPCError({
                  code: "CONFLICT",
                  message: "La Gift Card cambió mientras se procesaba el canje. Intenta nuevamente",
                });
              }
              await tx.insert(giftCardTransactions).values({
                giftCardId: card.id,
                transactionType: "redemption",
                amount: -redemptionAmount,
                balanceBefore: card.balance,
                balanceAfter: newBalance,
                orderType: "biopool_booking",
                orderId: String(created.id),
                notes: `Canje en reserva ${input.clientName} por ${ctx.user.name || ctx.user.email || "CMS"}`,
              });
            }
            for (const payment of input.payments) {
              const gift = giftCardPayments.find(item => item.payment === payment);
              await tx.insert(reservationPayments).values({
                module: "biopools",
                reservationId: created.id,
                method: payment.method,
                status: payment.status,
                amountClp: payment.amountClp,
                paidAt: payment.status === "paid" ? paymentDate(payment.paidAt) : null,
                reference: payment.method === "gift_card"
                  ? payment.giftCardCode!.trim().toUpperCase()
                  : (payment.reference ?? null),
                cardType: payment.cardType ?? null,
                giftCardId: gift?.card.id ?? null,
                createdByUserId: ctx.user.id,
              });
            }
            await addActivity(
              tx,
              created.id,
              "booking_created",
              { source: input.source, totalGuests, originalAmountClp },
              ctx.user.id
            );

            const paidAmount = amountPaidClp;
            const servicesUsed = Array.from(new Set([
              ...parseClientServicesUsed(client.serviciosUsados),
              "Biopiscinas",
            ]));
            const yearUpdates = input.bookingDate.startsWith("2025-")
              ? {
                  visitas2025: sql`COALESCE(${clients.visitas2025}, 0) + 1`,
                  gasto2025: sql`COALESCE(${clients.gasto2025}, 0) + ${paidAmount}`,
                  esLeal: sql`CASE WHEN COALESCE(${clients.visitas2026}, 0) > 0 THEN 1 ELSE COALESCE(${clients.esLeal}, 0) END`,
                }
              : input.bookingDate.startsWith("2026-")
                ? {
                    visitas2026: sql`COALESCE(${clients.visitas2026}, 0) + 1`,
                    gasto2026: sql`COALESCE(${clients.gasto2026}, 0) + ${paidAmount}`,
                    esLeal: sql`CASE WHEN COALESCE(${clients.visitas2025}, 0) > 0 THEN 1 ELSE COALESCE(${clients.esLeal}, 0) END`,
                  }
                : {};
            const visitDate = new Date(`${input.bookingDate}T12:00:00Z`);
            await tx.update(clients).set({
              totalVisitas: sql`COALESCE(${clients.totalVisitas}, 0) + 1`,
              totalGasto: sql`COALESCE(${clients.totalGasto}, 0) + ${paidAmount}`,
              primerVisita: client.primerVisita ?? visitDate,
              ultimaVisita: visitDate,
              serviciosUsados: JSON.stringify(servicesUsed),
              ticketPromedio: sql`ROUND((COALESCE(${clients.totalGasto}, 0) + ${paidAmount}) / (COALESCE(${clients.totalVisitas}, 0) + 1))`,
              ...yearUpdates,
            }).where(eq(clients.id, client.id));

            const reminderAt = new Date(
              chileLocalDateTimeToUtc(
                input.bookingDate,
                input.startTime
              ).getTime() -
                availability.service.reminderHoursBefore * 3_600_000
            );
            await tx.insert(biopoolNotifications).values(buildBiopoolNotificationSchedule({
              bookingId: created.id,
              reminderAt,
              reminderEmailEnabled: availability.service.reminderEmailEnabled,
              reminderWhatsappEnabled: availability.service.reminderWhatsappEnabled,
            }));
            return { id: created.id };
          } finally {
            await releaseCapacityLock(tx, lockName);
          }
        });
      }),
    addPayment: protectedProcedure
      .input(z.object({ bookingId: z.number(), payment: manualPaymentSchema }))
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "biopools.manage_agenda");
        validateManualPayment(input.payment);
        if (input.payment.method === "gift_card" && !canRedeemGiftCard(ctx.user)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No tienes permisos para canjear Gift Cards" });
        }
        const db = await database();
        return db.transaction(async tx => {
          const lockName = `biopool:payment:${input.bookingId}`;
          await acquireCapacityLock(tx, lockName);
          try {
            const [booking] = await tx.select().from(biopoolBookings).where(eq(biopoolBookings.id, input.bookingId)).limit(1);
            if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
            if (booking.status === "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "No se pueden agregar pagos a una reserva cancelada" });
            const existing = await tx.select().from(reservationPayments).where(and(eq(reservationPayments.module, "biopools"), eq(reservationPayments.reservationId, input.bookingId)));
            const totalClp = booking.originalAmountClp - booking.discountAmountClp;
            const detailedPlannedClp = existing.filter(item => item.status !== "refunded").reduce((sum, item) => sum + item.amountClp, 0);
            const plannedClp = existing.length ? detailedPlannedClp : booking.amountPaidClp;
            if (plannedClp + input.payment.amountClp > totalClp) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "El abono supera el saldo pendiente de la reserva" });
            }

            let giftCard: typeof giftCards.$inferSelect | undefined;
            if (input.payment.method === "gift_card") {
              const code = input.payment.giftCardCode!.trim().toUpperCase();
              [giftCard] = await tx.select().from(giftCards).where(eq(giftCards.code, code)).limit(1);
              if (!giftCard) throw new TRPCError({ code: "BAD_REQUEST", message: `Gift Card ${code} no encontrada` });
              try {
                if (giftCard.amount === 0) {
                  validateServiceGiftCardRedemption({ status: giftCard.status, purchaseStatus: giftCard.purchaseStatus, amount: giftCard.amount, expiresAt: giftCard.expiresAt });
                  if (input.payment.amountClp !== totalClp || plannedClp !== 0) throw new Error("Una Gift Card de servicio debe cubrir el total completo de la reserva");
                } else {
                  validateGiftCardRedemption({ status: giftCard.status, purchaseStatus: giftCard.purchaseStatus, balance: giftCard.balance, amount: input.payment.amountClp, expiresAt: giftCard.expiresAt });
                }
              } catch (error) {
                throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "No se pudo validar la Gift Card" });
              }
              const redemptionAmount = giftCard.amount === 0 ? 0 : input.payment.amountClp;
              const newBalance = giftCard.amount === 0 ? 0 : giftCard.balance - redemptionAmount;
              const updateResult: any = await tx.update(giftCards).set({
                balance: newBalance,
                status: giftCard.amount === 0 || newBalance === 0 ? "redeemed" : "active",
                redeemedAt: giftCard.amount === 0 || newBalance === 0 ? new Date() : null,
              }).where(and(eq(giftCards.id, giftCard.id), eq(giftCards.status, "active"), eq(giftCards.purchaseStatus, "completed"), eq(giftCards.balance, giftCard.balance)));
              const affectedRows = Number(updateResult?.[0]?.affectedRows ?? updateResult?.affectedRows ?? 0);
              if (affectedRows !== 1) throw new TRPCError({ code: "CONFLICT", message: "La Gift Card cambió mientras se procesaba el canje. Intenta nuevamente" });
              await tx.insert(giftCardTransactions).values({
                giftCardId: giftCard.id, transactionType: "redemption", amount: -redemptionAmount,
                balanceBefore: giftCard.balance, balanceAfter: newBalance, orderType: "biopool_booking",
                orderId: String(booking.id), notes: `Abono en reserva ${booking.bookingCode} por ${ctx.user.name || ctx.user.email || "CMS"}`,
              });
            }

            const [created] = await tx.insert(reservationPayments).values({
              module: "biopools",
              reservationId: booking.id,
              method: input.payment.method,
              status: input.payment.status,
              amountClp: input.payment.amountClp,
              paidAt: input.payment.status === "paid" ? paymentDate(input.payment.paidAt) : null,
              reference: input.payment.method === "gift_card" ? input.payment.giftCardCode!.trim().toUpperCase() : (input.payment.reference ?? null),
              cardType: input.payment.cardType ?? null,
              giftCardId: giftCard?.id ?? null,
              createdByUserId: ctx.user.id,
            }).$returningId();
            const newPaidTotal = booking.amountPaidClp + (input.payment.status === "paid" ? input.payment.amountClp : 0);
            await tx.update(biopoolBookings).set({
              amountPaidClp: newPaidTotal,
              paymentStatus: bookingPaymentStatus(newPaidTotal, totalClp),
              paymentMethod: existing.length || booking.amountPaidClp > 0 ? "mixed" : input.payment.method,
              paymentReference: existing.length || booking.amountPaidClp > 0 ? null : (input.payment.giftCardCode?.trim().toUpperCase() ?? input.payment.reference ?? null),
            }).where(eq(biopoolBookings.id, booking.id));
            await addActivity(tx, booking.id, "payment_added", { paymentId: created.id, method: input.payment.method, amountClp: input.payment.amountClp, status: input.payment.status }, ctx.user.id);
            return { id: created.id };
          } finally {
            await releaseCapacityLock(tx, lockName);
          }
        });
      }),
    completePayment: protectedProcedure
      .input(z.object({
        paymentId: z.number(),
        paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
        reference: z.string().trim().max(160).optional(),
        cardType: z.enum(["credit", "debit"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "biopools.manage_agenda");
        const db = await database();
        return db.transaction(async tx => {
          const [payment] = await tx.select().from(reservationPayments).where(and(eq(reservationPayments.id, input.paymentId), eq(reservationPayments.module, "biopools"))).limit(1);
          if (!payment) throw new TRPCError({ code: "NOT_FOUND" });
          if (payment.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Este pago ya no está pendiente" });
          if (payment.method !== "cash" && !input.reference) throw new TRPCError({ code: "BAD_REQUEST", message: "Ingresa el código o referencia del pago" });
          if (["payment_link", "transbank_machine"].includes(payment.method) && !input.cardType) throw new TRPCError({ code: "BAD_REQUEST", message: "Indica si la tarjeta es de crédito o débito" });
          const [booking] = await tx.select().from(biopoolBookings).where(eq(biopoolBookings.id, payment.reservationId)).limit(1);
          if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
          const totalClp = booking.originalAmountClp - booking.discountAmountClp;
          const newPaidTotal = booking.amountPaidClp + payment.amountClp;
          await tx.update(reservationPayments).set({ status: "paid", paidAt: paymentDate(input.paidAt), reference: input.reference ?? payment.reference, cardType: input.cardType ?? null }).where(eq(reservationPayments.id, payment.id));
          await tx.update(biopoolBookings).set({ amountPaidClp: newPaidTotal, paymentStatus: bookingPaymentStatus(newPaidTotal, totalClp) }).where(eq(biopoolBookings.id, booking.id));
          await addActivity(tx, booking.id, "payment_completed", { paymentId: payment.id, amountClp: payment.amountClp }, ctx.user.id);
          return { success: true };
        });
      }),
    updateStatus: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(bookingStatuses),
          reason: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "biopools.manage_agenda");
        const db = await database();
        const result = await db.transaction(async tx => {
          const [booking] = await tx
            .select()
            .from(biopoolBookings)
            .where(eq(biopoolBookings.id, input.id))
            .limit(1);
          if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
          const values: any = { status: input.status };
          let refund: {
            eligible: boolean;
            grossClp: number;
            feeClp: number;
            netClp: number;
          } | null = null;
          if (input.status === "cancelled") {
            const [service] = await tx
              .select()
              .from(biopoolServices)
              .where(eq(biopoolServices.id, booking.serviceId))
              .limit(1);
            refund = calculateRefundQuote({
              amountPaidClp: booking.amountPaidClp,
              feePercent: Number(service.refundFeePercent),
              hoursBeforeStart: hoursUntil(
                serializeDate(booking.bookingDate),
                booking.startTime
              ),
              minimumNoticeHours: service.refundNoticeHours,
              paymentIsPaid: booking.paymentStatus === "paid",
            });
            Object.assign(values, {
              cancellationReason:
                input.reason?.trim() || "Cancelada por recepción",
              cancelledAt: new Date(),
              cancelledByUserId: ctx.user.id,
              refundAmountClp: refund.netClp,
              refundFeeAmountClp: refund.feeClp,
              refundStatus: refund.eligible ? "pending" : "none",
            });
            await tx
              .update(biopoolNotifications)
              .set({ status: "skipped", error: "Reserva cancelada" })
              .where(
                and(
                  eq(biopoolNotifications.bookingId, input.id),
                  inArray(biopoolNotifications.status, ["pending", "failed"])
                )
              );
          }
          await tx
            .update(biopoolBookings)
            .set(values)
            .where(eq(biopoolBookings.id, input.id));
          await addActivity(
            tx,
            input.id,
            `status_${input.status}`,
            { reason: input.reason, refund },
            ctx.user.id
          );
          return { success: true, refund, paymentMethod: booking.paymentMethod };
        });
        if (
          input.status === "cancelled" &&
          result.refund?.eligible &&
          result.refund.netClp > 0 &&
          result.paymentMethod === "webpay_plus"
        ) {
          const [order] = await db.select().from(biopoolCheckoutOrders)
            .where(eq(biopoolCheckoutOrders.bookingId, input.id)).limit(1);
          if (order?.webpayToken) {
            try {
              const webpayRefund = await refundTransaction(order.webpayToken, result.refund.netClp);
              const reference = String(webpayRefund?.authorization_code || webpayRefund?.type || order.buyOrder || "Webpay");
              await db.update(biopoolBookings).set({
                refundStatus: "processed",
                paymentStatus: result.refund.netClp >= order.totalClp ? "refunded" : "partially_refunded",
                paymentReference: reference,
              }).where(eq(biopoolBookings.id, input.id));
              await addActivity(db, input.id, "refund_processed_webpay", {
                grossClp: result.refund.grossClp,
                feeClp: result.refund.feeClp,
                refundedClp: result.refund.netClp,
                response: webpayRefund,
              }, ctx.user.id);
              return { ...result, automaticRefund: true, refundError: null };
            } catch (error) {
              await addActivity(db, input.id, "refund_webpay_failed", { error: String(error) }, ctx.user.id);
              return { ...result, automaticRefund: false, refundError: "El reembolso quedó pendiente para revisión" };
            }
          }
        }
        return { ...result, automaticRefund: false, refundError: null };
      }),
    markRefundProcessed: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          reference: z.string().trim().min(2).max(160),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "biopools.manage_agenda");
        const db = await database();
        const [booking] = await db
          .select()
          .from(biopoolBookings)
          .where(eq(biopoolBookings.id, input.id))
          .limit(1);
        if (!booking || booking.refundStatus !== "pending") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "La reserva no tiene un reembolso pendiente",
          });
        }
        await db
          .update(biopoolBookings)
          .set({
            refundStatus: "processed",
            paymentStatus: "refunded",
            paymentReference: input.reference,
          })
          .where(eq(biopoolBookings.id, input.id));
        await addActivity(
          db,
          input.id,
          "refund_processed",
          {
            amountClp: booking.refundAmountClp,
            feeClp: booking.refundFeeAmountClp,
            reference: input.reference,
          },
          ctx.user.id
        );
        return { success: true };
      }),
    reschedule: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          bookingDate: dateSchema,
          startTime: timeSchema,
          reason: z.string().trim().min(3),
          overridePolicy: z.boolean().default(false),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx.user, "biopools.manage_agenda");
        const db = await database();
        return db.transaction(async tx => {
          const [booking] = await tx
            .select()
            .from(biopoolBookings)
            .where(eq(biopoolBookings.id, input.id))
            .limit(1);
          if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
          const lockName = `biopool:shared:${input.bookingDate}`;
          await acquireCapacityLock(tx, lockName);
          try {
            const [service] = await tx
              .select()
              .from(biopoolServices)
              .where(eq(biopoolServices.id, booking.serviceId))
              .limit(1);
            const canOverride =
              input.overridePolicy && ctx.user.role === "super_admin";
            if (
              !canOverride &&
              booking.rescheduleCount >= service.maxStaffReschedules
            )
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: `La reserva ya alcanzó el máximo de ${service.maxStaffReschedules} reagendamientos`,
              });
            if (
              !canOverride &&
              hoursUntil(
                serializeDate(booking.bookingDate),
                booking.startTime
              ) < service.rescheduleNoticeHours
            )
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: `La política exige al menos ${service.rescheduleNoticeHours} horas de anticipación`,
              });
            const target = await availabilityForDay(
              tx,
              booking.serviceId,
              input.bookingDate,
              booking.id
            );
            const slot = target.slots.find(
              (item: any) => item.startTime === input.startTime
            );
            if (!slot || slot.availableSeats < booking.totalGuests)
              throw new TRPCError({
                code: "CONFLICT",
                message:
                  "No existe capacidad suficiente en el horario solicitado",
              });
            await tx
              .update(biopoolBookings)
              .set({
                bookingDate: input.bookingDate,
                startTime: input.startTime,
                endTime: slot.endTime,
                rescheduleCount: booking.rescheduleCount + 1,
                attendanceConfirmation: "pending",
              })
              .where(eq(biopoolBookings.id, input.id));
            await addActivity(
              tx,
              input.id,
              "booking_rescheduled",
              {
                from: `${serializeDate(booking.bookingDate)} ${booking.startTime}`,
                to: `${input.bookingDate} ${input.startTime}`,
                reason: input.reason,
                policyOverride: canOverride,
              },
              ctx.user.id
            );
            await tx
              .update(biopoolNotifications)
              .set({ status: "skipped", error: "Reserva reagendada" })
              .where(
                and(
                  eq(biopoolNotifications.bookingId, input.id),
                  eq(biopoolNotifications.type, "reminder"),
                  inArray(biopoolNotifications.status, ["pending", "failed"])
                )
              );
            const reminderAt = new Date(
              chileLocalDateTimeToUtc(
                input.bookingDate,
                input.startTime
              ).getTime() -
                service.reminderHoursBefore * 3_600_000
            );
            const reminders: Array<typeof biopoolNotifications.$inferInsert> =
              [];
            if (service.reminderEmailEnabled)
              reminders.push({
                bookingId: input.id,
                type: "reminder",
                channel: "email",
                scheduledAt: reminderAt,
              });
            if (service.reminderWhatsappEnabled)
              reminders.push({
                bookingId: input.id,
                type: "reminder",
                channel: "whatsapp",
                scheduledAt: reminderAt,
              });
            if (reminders.length)
              await tx.insert(biopoolNotifications).values(reminders);
            return { success: true };
          } finally {
            await releaseCapacityLock(tx, lockName);
          }
        });
      }),
  }),

  attendance: router({
    get: publicProcedure
      .input(z.object({ token: z.string().min(20).max(64) }))
      .query(async ({ input }) => {
        const db = await database();
        const [row] = await db
          .select({ booking: biopoolBookings, service: biopoolServices })
          .from(biopoolBookings)
          .leftJoin(
            biopoolServices,
            eq(biopoolBookings.serviceId, biopoolServices.id)
          )
          .where(eq(biopoolBookings.attendanceToken, input.token))
          .limit(1);
        if (!row?.booking)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Enlace de confirmación inválido",
          });
        return {
          bookingCode: row.booking.bookingCode,
          clientName: row.booking.clientName,
          bookingDate: serializeDate(row.booking.bookingDate),
          startTime: row.booking.startTime,
          serviceName: row.service?.name ?? "Biopiscinas Geotermales",
          response: row.booking.attendanceConfirmation,
          cancelled: row.booking.status === "cancelled",
        };
      }),
    respond: publicProcedure
      .input(
        z.object({
          token: z.string().min(20).max(64),
          response: z.enum(["confirmed", "declined"]),
        })
      )
      .mutation(async ({ input }) => {
        const db = await database();
        const [booking] = await db
          .select()
          .from(biopoolBookings)
          .where(eq(biopoolBookings.attendanceToken, input.token))
          .limit(1);
        if (!booking)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Enlace de confirmación inválido",
          });
        if (booking.status === "cancelled") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "La reserva está cancelada",
          });
        }
        await db
          .update(biopoolBookings)
          .set({ attendanceConfirmation: input.response })
          .where(eq(biopoolBookings.id, booking.id));
        await addActivity(db, booking.id, `attendance_${input.response}`, {
          source: "customer_link",
        });
        return { success: true };
      }),
  }),
});
