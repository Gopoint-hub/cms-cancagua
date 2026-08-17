import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  biopoolBookings,
  biopoolCheckoutItems,
  biopoolCheckoutOrders,
  biopoolTicketTypes,
  saunaBookings,
  saunaCheckoutOrders,
  saunaServices,
  serviceCartCheckoutItems,
  serviceCartCheckoutOrders,
} from "../drizzle/schema";
import { validateAdultChildQuantities } from "../shared/biopoolsCapacity";
import { hasSaunaBookingLeadTime, SAUNA_CAPACITY, validateSaunaParty } from "../shared/sauna";
import { publicProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { chileLocalDateTimeToUtc } from "./massageNps";
import { calculateWellnessCartDiscount } from "./massageDiscounts";
import {
  acquireCapacityLock as acquireBiopoolCapacityLock,
  availabilityForDay as biopoolAvailabilityForDay,
  releaseCapacityLock as releaseBiopoolCapacityLock,
} from "./biopoolsRouter";
import {
  acquireCapacityLock as acquireSaunaCapacityLock,
  availabilityForDay as saunaAvailabilityForDay,
  settings as saunaSettings,
} from "./saunaRouter";
import { finalizeApprovedBiopoolOrder, isFullyDiscountedBiopoolOrder } from "./biopoolWebpay";
import { createTransaction, generateSessionId } from "./webpay";
import { serviceCartResultUrl } from "./serviceCartCheckout";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/);
const biopoolItemSchema = z.object({
  module: z.literal("biopools"),
  serviceId: z.number().int().positive(),
  bookingDate: dateSchema,
  startTime: timeSchema,
  adultQuantity: z.number().int().min(1).max(40),
  childQuantity: z.number().int().min(0).max(40),
  discountCode: z.string().trim().max(50).optional(),
});
const saunaItemSchema = z.object({
  module: z.literal("sauna"),
  serviceId: z.number().int().positive(),
  bookingDate: dateSchema,
  startTime: timeSchema,
  privateGuestCount: z.number().int().min(1).max(6).optional(),
});

function generateCartBuyOrder(orderId: number): string {
  return `CART-${orderId}-${Date.now().toString(36).slice(-6)}`.substring(0, 26);
}

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible" });
  return db;
}

export const serviceCartRouter = router({
  public: router({
    startPayment: publicProcedure
      .input(z.object({
        clientName: z.string().trim().min(2).max(200),
        clientEmail: z.string().trim().email(),
        clientPhone: z.string().trim().min(8).max(40),
        items: z.array(z.discriminatedUnion("module", [biopoolItemSchema, saunaItemSchema])).min(1).max(2),
        acceptedTerms: z.literal(true),
        utmSource: z.string().max(100).optional(),
        utmMedium: z.string().max(100).optional(),
        utmCampaign: z.string().max(100).optional(),
      }).superRefine(({ items }, ctx) => {
        for (const module of ["biopools", "sauna"] as const) {
          if (items.filter(item => item.module === module).length > 1) {
            ctx.addIssue({ code: "custom", path: ["items"], message: `Sólo puedes agregar una reserva de ${module === "biopools" ? "Biopiscinas" : "Sauna"} por pago` });
          }
        }
      }))
      .mutation(async ({ input }) => {
        const db = await database();
        const expiresAt = new Date(Date.now() + 30 * 60_000);
        const publicToken = nanoid(48);
        let cartOrderId = 0;
        let totalClp = 0;
        const childOrders: Array<{ module: "biopools" | "sauna"; id: number; totalClp: number; fullyDiscounted?: boolean }> = [];
        const biopoolItem = input.items.find(item => item.module === "biopools");
        const saunaItem = input.items.find(item => item.module === "sauna");
        const biopoolLockName = biopoolItem ? `biopool:shared:${biopoolItem.bookingDate}` : null;

        await db.transaction(async tx => {
          if (saunaItem) await acquireSaunaCapacityLock(tx, saunaItem.bookingDate);
          if (biopoolLockName) await acquireBiopoolCapacityLock(tx, biopoolLockName);
          try {
            const prepared: Array<{
              module: "biopools" | "sauna";
              childOrderId: number;
              itemName: string;
              bookingDate: string;
              startTime: string;
              endTime: string;
              guests: number;
              totalClp: number;
            }> = [];

            if (biopoolItem) {
              if (chileLocalDateTimeToUtc(biopoolItem.bookingDate, biopoolItem.startTime) <= new Date()) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "El horario de Biopiscinas ya pasó" });
              }
              const quantityError = validateAdultChildQuantities(biopoolItem.adultQuantity, biopoolItem.childQuantity);
              if (quantityError) throw new TRPCError({ code: "BAD_REQUEST", message: quantityError });
              const availability = await biopoolAvailabilityForDay(tx, biopoolItem.serviceId, biopoolItem.bookingDate);
              if (availability.service.status !== "published") throw new TRPCError({ code: "NOT_FOUND", message: "Biopiscinas no está publicado" });
              const slot = availability.slots.find((candidate: any) => candidate.startTime === biopoolItem.startTime);
              const guests = biopoolItem.adultQuantity + biopoolItem.childQuantity;
              if (!slot || slot.availableSeats < guests) throw new TRPCError({ code: "CONFLICT", message: "El horario de Biopiscinas ya no tiene los cupos necesarios" });
              const tickets = await tx.select().from(biopoolTicketTypes).where(and(eq(biopoolTicketTypes.serviceId, biopoolItem.serviceId), eq(biopoolTicketTypes.active, 1)));
              const adult = tickets.find((ticket: any) => ticket.code === "adult");
              const child = tickets.find((ticket: any) => ticket.code === "child");
              if (!adult || (biopoolItem.childQuantity > 0 && !child)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "La venta de Biopiscinas no está configurada" });
              const subtotalClp = adult.priceClp * biopoolItem.adultQuantity + (child?.priceClp ?? 0) * biopoolItem.childQuantity;
              const discount = biopoolItem.discountCode
                ? await calculateWellnessCartDiscount(tx, biopoolItem.discountCode, [{ service: "biopiscinas", serviceId: biopoolItem.serviceId, originalAmount: subtotalClp }])
                : null;
              const itemTotal = discount?.finalTotal ?? subtotalClp;
              const childToken = nanoid(48);
              const [created] = await tx.insert(biopoolCheckoutOrders).values({
                publicToken: childToken,
                serviceId: biopoolItem.serviceId,
                clientName: input.clientName,
                clientEmail: input.clientEmail.toLowerCase(),
                clientPhone: input.clientPhone,
                bookingDate: biopoolItem.bookingDate,
                startTime: biopoolItem.startTime,
                endTime: slot.endTime,
                adultQuantity: biopoolItem.adultQuantity,
                childQuantity: biopoolItem.childQuantity,
                totalGuests: guests,
                subtotalClp,
                discountClp: discount?.discountTotal ?? 0,
                discountCodeId: discount?.discountCodeId ?? null,
                discountCode: discount?.code ?? null,
                totalClp: itemTotal,
                status: "initiating",
                expiresAt,
                utmSource: input.utmSource ?? null,
                utmMedium: input.utmMedium ?? null,
                utmCampaign: input.utmCampaign ?? null,
              }).$returningId();
              await tx.insert(biopoolCheckoutItems).values([
                { orderId: created.id, ticketTypeId: adult.id, code: adult.code, name: adult.name, unitPriceClp: adult.priceClp, quantity: biopoolItem.adultQuantity, subtotalClp: adult.priceClp * biopoolItem.adultQuantity },
                ...(biopoolItem.childQuantity > 0 && child ? [{ orderId: created.id, ticketTypeId: child.id, code: child.code, name: child.name, unitPriceClp: child.priceClp, quantity: biopoolItem.childQuantity, subtotalClp: child.priceClp * biopoolItem.childQuantity }] : []),
              ]);
              childOrders.push({ module: "biopools", id: created.id, totalClp: itemTotal, fullyDiscounted: isFullyDiscountedBiopoolOrder({ subtotalClp, discountClp: discount?.discountTotal ?? 0, totalClp: itemTotal, discountCodeId: discount?.discountCodeId ?? null }) });
              prepared.push({ module: "biopools", childOrderId: created.id, itemName: availability.service.name, bookingDate: biopoolItem.bookingDate, startTime: biopoolItem.startTime, endTime: slot.endTime, guests, totalClp: itemTotal });
              totalClp += itemTotal;
            }

            if (saunaItem) {
              const config = await saunaSettings(tx);
              if (!config.checkoutEnabled) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "La venta online de Sauna todavía no está habilitada" });
              const [service] = await tx.select().from(saunaServices).where(and(eq(saunaServices.id, saunaItem.serviceId), eq(saunaServices.published, 1))).limit(1);
              if (!service || ["staff", "program"].includes(service.kind)) throw new TRPCError({ code: "NOT_FOUND", message: "La opción de Sauna no está disponible" });
              const isPrivate = service.kind === "private" || service.partySize >= 4;
              const guests = isPrivate ? (saunaItem.privateGuestCount ?? SAUNA_CAPACITY) : service.partySize;
              const partyError = validateSaunaParty(guests, isPrivate);
              if (partyError) throw new TRPCError({ code: "BAD_REQUEST", message: partyError });
              if (saunaItem.startTime < "10:00" || saunaItem.startTime > "20:00") throw new TRPCError({ code: "BAD_REQUEST", message: "Elige un horario de Sauna entre las 10:00 y las 20:00" });
              if (!hasSaunaBookingLeadTime(chileLocalDateTimeToUtc(saunaItem.bookingDate, saunaItem.startTime), config.bookingLeadHours)) throw new TRPCError({ code: "BAD_REQUEST", message: `La reserva de Sauna exige al menos ${config.bookingLeadHours} horas de anticipación` });
              const availability = await saunaAvailabilityForDay(tx, saunaItem.bookingDate);
              const slot = availability.slots.find(candidate => candidate.startTime === saunaItem.startTime);
              if (!slot || slot.availableSeats < service.capacityUsed || (isPrivate && !slot.privateAvailable)) throw new TRPCError({ code: "CONFLICT", message: "El horario de Sauna ya no tiene los cupos necesarios" });
              const [created] = await tx.insert(saunaCheckoutOrders).values({
                publicToken: nanoid(48),
                serviceId: service.id,
                clientName: input.clientName,
                clientEmail: input.clientEmail.toLowerCase(),
                clientPhone: input.clientPhone,
                bookingDate: saunaItem.bookingDate,
                startTime: saunaItem.startTime,
                endTime: slot.endTime,
                guests,
                capacityUsed: service.capacityUsed,
                isPrivate: isPrivate ? 1 : 0,
                totalClp: service.priceClp,
                status: "initiating",
                expiresAt,
              }).$returningId();
              childOrders.push({ module: "sauna", id: created.id, totalClp: service.priceClp });
              prepared.push({ module: "sauna", childOrderId: created.id, itemName: service.name, bookingDate: saunaItem.bookingDate, startTime: saunaItem.startTime, endTime: slot.endTime, guests, totalClp: service.priceClp });
              totalClp += service.priceClp;
            }

            const [cart] = await tx.insert(serviceCartCheckoutOrders).values({
              publicToken,
              clientName: input.clientName,
              clientEmail: input.clientEmail.toLowerCase(),
              clientPhone: input.clientPhone,
              totalClp,
              status: "initiating",
              expiresAt,
            }).$returningId();
            cartOrderId = cart.id;
            await tx.insert(serviceCartCheckoutItems).values(prepared.map(item => ({ cartOrderId, ...item })));
          } finally {
            if (biopoolLockName) await releaseBiopoolCapacityLock(tx, biopoolLockName);
          }
        });

        if (totalClp === 0) {
          const discounted = childOrders.find(item => item.module === "biopools" && item.fullyDiscounted);
          if (!discounted || childOrders.length !== 1) throw new TRPCError({ code: "BAD_REQUEST", message: "El carrito no tiene un total válido" });
          await finalizeApprovedBiopoolOrder(discounted.id, { kind: "discount" });
          await db.update(serviceCartCheckoutOrders).set({ status: "paid", paidAt: new Date(), completedAt: new Date() }).where(eq(serviceCartCheckoutOrders.id, cartOrderId));
          return { paymentRequired: false as const, paymentUrl: null, token: null, orderToken: publicToken, resultUrl: serviceCartResultUrl(publicToken, "pagado") };
        }

        const buyOrder = generateCartBuyOrder(cartOrderId);
        const sessionId = generateSessionId();
        const origin = (ENV.appUrl || "https://cms.cancagua.cl").replace(/\/$/, "");
        try {
          const payment = await createTransaction(buyOrder, sessionId, totalClp, `${origin}/api/servicios/webpay/return`);
          await db.transaction(async tx => {
            await tx.update(serviceCartCheckoutOrders).set({ status: "payment_pending", buyOrder, sessionId, webpayToken: payment.token }).where(eq(serviceCartCheckoutOrders.id, cartOrderId));
            for (const child of childOrders) {
              if (child.module === "biopools") await tx.update(biopoolCheckoutOrders).set({ status: "payment_pending" }).where(eq(biopoolCheckoutOrders.id, child.id));
              else await tx.update(saunaCheckoutOrders).set({ status: "payment_pending" }).where(eq(saunaCheckoutOrders.id, child.id));
            }
          });
          return { paymentRequired: true as const, paymentUrl: payment.url, token: payment.token, orderToken: publicToken, resultUrl: null };
        } catch (error) {
          await db.transaction(async tx => {
            await tx.update(serviceCartCheckoutOrders).set({ status: "failed", error: String(error).slice(0, 2000) }).where(eq(serviceCartCheckoutOrders.id, cartOrderId));
            for (const child of childOrders) {
              if (child.module === "biopools") await tx.update(biopoolCheckoutOrders).set({ status: "failed", error: "No se pudo iniciar el pago del carrito" }).where(eq(biopoolCheckoutOrders.id, child.id));
              else await tx.update(saunaCheckoutOrders).set({ status: "failed", error: "No se pudo iniciar el pago del carrito" }).where(eq(saunaCheckoutOrders.id, child.id));
            }
          });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No pudimos iniciar el pago con Webpay" });
        }
      }),

    paymentStatus: publicProcedure.input(z.object({ orderToken: z.string().min(20) })).query(async ({ input }) => {
      const db = await database();
      const [order] = await db.select().from(serviceCartCheckoutOrders).where(eq(serviceCartCheckoutOrders.publicToken, input.orderToken)).limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      const items = await db.select().from(serviceCartCheckoutItems).where(eq(serviceCartCheckoutItems.cartOrderId, order.id));
      const results = await Promise.all(items.map(async item => {
        if (item.module === "biopools") {
          const [child] = await db.select().from(biopoolCheckoutOrders).where(eq(biopoolCheckoutOrders.id, item.childOrderId)).limit(1);
          const [booking] = child?.bookingId ? await db.select({ bookingCode: biopoolBookings.bookingCode }).from(biopoolBookings).where(eq(biopoolBookings.id, child.bookingId)).limit(1) : [];
          return { ...item, bookingCode: booking?.bookingCode ?? null };
        }
        const [child] = await db.select().from(saunaCheckoutOrders).where(eq(saunaCheckoutOrders.id, item.childOrderId)).limit(1);
        const [booking] = child?.bookingId ? await db.select({ bookingCode: saunaBookings.bookingCode }).from(saunaBookings).where(eq(saunaBookings.id, child.bookingId)).limit(1) : [];
        return { ...item, bookingCode: booking?.bookingCode ?? null };
      }));
      return { status: order.status, totalClp: order.totalClp, items: results, clientEmail: order.clientEmail.replace(/^(.{2}).*(@.*)$/, "$1***$2") };
    }),
  }),
});
