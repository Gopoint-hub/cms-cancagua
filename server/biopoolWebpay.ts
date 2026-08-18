import express from "express";
import { buildBookingCode } from "../shared/bookingCode";
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  biopoolBookingActivity,
  biopoolBookings,
  biopoolCheckoutOrders,
  biopoolNotifications,
  biopoolServices,
  clients,
  reservationPayments,
} from "../drizzle/schema";
import { getDb } from "./db";
import { commitTransaction, isTransactionApproved } from "./webpay";
import { chileLocalDateTimeToUtc } from "./massageNps";
import { ENV } from "./_core/env";
import { recordWellnessCartDiscountUsage } from "./massageDiscounts";
import { buildBiopoolNotificationSchedule } from "./biopoolNotifications";
import { redeemGiftCardPayment } from "./reservationPayments";

export type BiopoolPaymentOrderCheck = {
  buyOrder: string | null;
  sessionId: string | null;
  totalClp: number;
  webpayToken: string | null;
};

export type BiopoolPaymentResultCheck = {
  buyOrder: string;
  sessionId: string;
  amount: number;
  responseCode: number;
  status: string;
};

export function validateBiopoolPayment(
  order: BiopoolPaymentOrderCheck,
  result: BiopoolPaymentResultCheck,
  token: string
): { approved: boolean; reason?: string } {
  if (!order.webpayToken || order.webpayToken !== token)
    return { approved: false, reason: "Token Webpay no corresponde a la orden" };
  if (!order.buyOrder || result.buyOrder !== order.buyOrder)
    return { approved: false, reason: "Orden de compra Webpay no corresponde" };
  if (!order.sessionId || result.sessionId !== order.sessionId)
    return { approved: false, reason: "Sesión Webpay no corresponde" };
  if (Number(result.amount) !== order.totalClp)
    return { approved: false, reason: "Monto Webpay no corresponde al total del CMS" };
  if (!isTransactionApproved(result.responseCode, result.status))
    return { approved: false, reason: "Pago rechazado por Webpay" };
  return { approved: true };
}

function dateValue(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function parseClientServicesUsed(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((service): service is string => typeof service === "string" && Boolean(service.trim()))
      : [];
  } catch {
    return [];
  }
}

export function biopoolResultUrl(publicToken: string, state: string): string {
  const frontend = (ENV.frontendUrl || "https://cancagua.cl").replace(/\/$/, "");
  return `${frontend}/servicios/biopiscinas/pago/resultado?order=${encodeURIComponent(publicToken)}&estado=${encodeURIComponent(state)}`;
}

export function isFullyDiscountedBiopoolOrder(order: {
  subtotalClp: number;
  discountClp: number;
  totalClp: number;
  discountCodeId: number | null;
}): boolean {
  return order.subtotalClp > 0
    && order.totalClp === 0
    && order.discountClp === order.subtotalClp
    && Boolean(order.discountCodeId);
}

type BiopoolOrderCompletion =
  | { kind: "webpay"; result: any }
  | { kind: "discount" }
  | { kind: "gift_card"; code: string };

export async function finalizeApprovedBiopoolOrder(
  orderId: number,
  completion: BiopoolOrderCompletion,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const completed = await db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM biopool_checkout_orders WHERE id = ${orderId} FOR UPDATE`);
    const [order] = await tx.select().from(biopoolCheckoutOrders).where(eq(biopoolCheckoutOrders.id, orderId)).limit(1);
    if (!order) throw new Error("Orden no encontrada");
    if (order.bookingId && order.status === "paid") {
      return {
        alreadyFinalized: true as const,
        bookingId: order.bookingId,
        clientId: null,
        normalizedEmail: "",
        order,
        service: null,
      };
    }

    const [service] = await tx.select().from(biopoolServices).where(eq(biopoolServices.id, order.serviceId)).limit(1);
    if (!service) throw new Error("Servicio no encontrado");
    const normalizedEmail = order.clientEmail.trim().toLowerCase();
    let [client] = await tx.select().from(clients).where(or(eq(clients.email, normalizedEmail), eq(clients.phone, order.clientPhone))).limit(1);
    if (client) {
      await tx.update(clients).set({
        name: order.clientName,
        email: normalizedEmail,
        phone: order.clientPhone,
        utmSource: order.utmSource ?? client.utmSource,
        utmMedium: order.utmMedium ?? client.utmMedium,
        utmCampaign: order.utmCampaign ?? client.utmCampaign,
      }).where(eq(clients.id, client.id));
    } else {
      const [created] = await tx.insert(clients).values({
        email: normalizedEmail,
        name: order.clientName,
        phone: order.clientPhone,
        origen: "web_biopiscinas",
        utmSource: order.utmSource,
        utmMedium: order.utmMedium,
        utmCampaign: order.utmCampaign,
      }).$returningId();
      [client] = await tx.select().from(clients).where(eq(clients.id, created.id)).limit(1);
    }

    const [createdBooking] = await tx.insert(biopoolBookings).values({
      bookingCode: buildBookingCode("BIO", dateValue(order.bookingDate)),
      serviceId: order.serviceId,
      clientId: client.id,
      clientName: order.clientName,
      clientEmail: normalizedEmail,
      clientPhone: order.clientPhone,
      bookingDate: dateValue(order.bookingDate),
      startTime: order.startTime,
      endTime: order.endTime,
      adultQuantity: order.adultQuantity,
      childQuantity: order.childQuantity,
      totalGuests: order.totalGuests,
      status: "confirmed",
      attendanceToken: nanoid(48),
      paymentStatus: "paid",
      paymentMethod: completion.kind === "webpay" ? "webpay_plus" : completion.kind === "gift_card" ? "gift_card" : "discount_code",
      paymentReference: completion.kind === "webpay"
        ? completion.result.authorizationCode || order.buyOrder
        : completion.kind === "gift_card" ? completion.code : order.discountCode || order.publicToken,
      originalAmountClp: order.subtotalClp,
      discountAmountClp: order.discountClp,
      discountCodeId: order.discountCodeId,
      discountCode: order.discountCode,
      amountPaidClp: order.totalClp,
      refundFeePercent: service.refundFeePercent,
      source: "web",
    }).$returningId();

    if (completion.kind === "webpay") {
      await tx.insert(reservationPayments).values({
        module: "biopools",
        reservationId: createdBooking.id,
        method: "webpay_plus",
        status: "paid",
        amountClp: order.totalClp,
        paidAt: new Date(),
        reference: completion.result.authorizationCode || order.buyOrder,
      });
    } else if (completion.kind === "gift_card") {
      const paidAt = new Date();
      const gift = await redeemGiftCardPayment({ tx, payment: { method: "gift_card", status: "paid", amountClp: order.totalClp, paidAt: paidAt.toISOString().slice(0, 16), giftCardCode: completion.code }, totalClp: order.totalClp, module: "biopools", reservationId: createdBooking.id, note: `Canje web en Biopiscinas ${createdBooking.id}`, serviceKey: "biopools" });
      await tx.insert(reservationPayments).values({ module: "biopools", reservationId: createdBooking.id, method: "gift_card", status: "paid", amountClp: order.totalClp, paidAt, reference: gift.code, giftCardId: gift.id });
    }

    await tx.update(biopoolCheckoutOrders).set({
      bookingId: createdBooking.id,
      status: "paid",
      webpayStatus: completion.kind === "webpay" ? completion.result.status : "NOT_REQUIRED",
      responseCode: completion.kind === "webpay" ? completion.result.responseCode : 0,
      authorizationCode: completion.kind === "webpay" ? completion.result.authorizationCode : null,
      cardNumber: completion.kind === "webpay" ? completion.result.cardNumber : null,
      paymentTypeCode: completion.kind === "webpay" ? completion.result.paymentTypeCode : null,
      transactionDate: completion.kind === "webpay" ? completion.result.transactionDate : null,
      rawResponse: JSON.stringify(completion.kind === "webpay"
        ? completion.result
        : completion.kind === "gift_card" ? { paymentRequired: false, reason: "gift_card", giftCardCode: completion.code } : { paymentRequired: false, reason: "fully_discounted", discountCode: order.discountCode }),
      paidAt: new Date(),
      completedAt: new Date(),
      error: null,
    }).where(eq(biopoolCheckoutOrders.id, order.id));

    return {
      alreadyFinalized: false as const,
      bookingId: createdBooking.id,
      clientId: client.id,
      normalizedEmail,
      order,
      service,
    };
  });

  if (completed.alreadyFinalized || !completed.clientId || !completed.service) return;

  // Estas tareas son complementarias. Si una integración auxiliar falla, la
  // reserva y el cupo permanecen confirmados y el error queda registrado.
  try {
    await db.insert(biopoolBookingActivity).values({
      bookingId: completed.bookingId,
      action: completion.kind === "webpay" ? "booking_created_webpay" : completion.kind === "gift_card" ? "booking_created_gift_card" : "booking_created_discount_code",
      detail: JSON.stringify(completion.kind === "webpay"
        ? {
            orderId: completed.order.id,
            buyOrder: completed.order.buyOrder,
            authorizationCode: completion.result.authorizationCode,
          }
        : completion.kind === "gift_card" ? {
            orderId: completed.order.id,
            giftCardCode: completion.code,
            originalAmountClp: completed.order.subtotalClp,
            discountAmountClp: completed.order.discountClp,
            amountPaidClp: completed.order.totalClp,
          } : {
            orderId: completed.order.id,
            discountCodeId: completed.order.discountCodeId,
            discountCode: completed.order.discountCode,
            originalAmountClp: completed.order.subtotalClp,
            discountAmountClp: completed.order.discountClp,
            amountPaidClp: 0,
          }),
    });
  } catch (error) {
    console.error("[biopools:checkout] Reserva confirmada; no se pudo registrar la actividad", {
      bookingId: completed.bookingId,
      error,
    });
  }

  try {
    const reminderAt = new Date(
      chileLocalDateTimeToUtc(dateValue(completed.order.bookingDate), completed.order.startTime).getTime()
      - completed.service.reminderHoursBefore * 3_600_000,
    );
    await db.insert(biopoolNotifications).values(buildBiopoolNotificationSchedule({
      bookingId: completed.bookingId,
      reminderAt,
      reminderEmailEnabled: completed.service.reminderEmailEnabled,
      reminderWhatsappEnabled: completed.service.reminderWhatsappEnabled,
    }));
  } catch (error) {
    console.error("[biopools:checkout] Reserva confirmada; no se pudieron programar las notificaciones", {
      bookingId: completed.bookingId,
      error,
    });
  }

  if (completed.order.discountCodeId && completed.order.discountClp > 0) {
    try {
      await recordWellnessCartDiscountUsage(db, {
        module: "biopools",
        childOrderId: completed.order.id,
        discountCodeId: completed.order.discountCodeId,
        email: completed.normalizedEmail,
        fallbackRequestId: completed.order.buyOrder || completed.order.publicToken,
        fallbackOriginalAmount: completed.order.subtotalClp,
        fallbackDiscountAmount: completed.order.discountClp,
        fallbackFinalAmount: completed.order.totalClp,
      });
    } catch (error) {
      console.error("[biopools:checkout] Reserva confirmada; no se pudo registrar el uso del descuento", {
        bookingId: completed.bookingId,
        discountCodeId: completed.order.discountCodeId,
        error,
      });
    }
  }

  try {
    const [client] = await db.select().from(clients).where(eq(clients.id, completed.clientId)).limit(1);
    if (client) {
      const visitDate = dateValue(completed.order.bookingDate);
      const visitDateObject = new Date(`${visitDate}T12:00:00Z`);
      const servicesUsed = Array.from(new Set([
        ...parseClientServicesUsed(client.serviciosUsados),
        "Biopiscinas",
      ]));
      await db.update(clients).set({
        totalVisitas: sql`COALESCE(${clients.totalVisitas}, 0) + 1`,
        visitas2026: sql`COALESCE(${clients.visitas2026}, 0) + 1`,
        totalGasto: sql`COALESCE(${clients.totalGasto}, 0) + ${completed.order.totalClp}`,
        gasto2026: sql`COALESCE(${clients.gasto2026}, 0) + ${completed.order.totalClp}`,
        primerVisita: client.primerVisita ?? visitDateObject,
        ultimaVisita: visitDateObject,
        serviciosUsados: JSON.stringify(servicesUsed),
        ticketPromedio: sql`ROUND((COALESCE(${clients.totalGasto}, 0) + ${completed.order.totalClp}) / (COALESCE(${clients.totalVisitas}, 0) + 1))`,
      }).where(eq(clients.id, client.id));
    }
  } catch (error) {
    console.error("[biopools:checkout] Reserva confirmada; no se pudo actualizar el historial comercial", {
      clientId: completed.clientId,
      error,
    });
  }
}

export const biopoolWebpayReturnRouter = express.Router();

biopoolWebpayReturnRouter.all("/return", async (req, res) => {
  const db = await getDb();
  if (!db) return res.redirect(biopoolResultUrl("unavailable", "error"));
  const token = String(req.body?.token_ws || req.query?.token_ws || "");
  const abortedBuyOrder = String(req.body?.TBK_ORDEN_COMPRA || req.query?.TBK_ORDEN_COMPRA || "");
  const abortedSession = String(req.body?.TBK_ID_SESION || req.query?.TBK_ID_SESION || "");
  try {
    if (!token) {
      const [order] = await db.select().from(biopoolCheckoutOrders).where(and(eq(biopoolCheckoutOrders.buyOrder, abortedBuyOrder), eq(biopoolCheckoutOrders.sessionId, abortedSession))).limit(1);
      if (!order) return res.redirect(biopoolResultUrl("not-found", "abortado"));
      if (order.status !== "paid") await db.update(biopoolCheckoutOrders).set({ status: "aborted", error: "Pago abortado por el usuario" }).where(eq(biopoolCheckoutOrders.id, order.id));
      return res.redirect(biopoolResultUrl(order.publicToken, "abortado"));
    }
    const [order] = await db.select().from(biopoolCheckoutOrders).where(eq(biopoolCheckoutOrders.webpayToken, token)).limit(1);
    if (!order) return res.redirect(biopoolResultUrl("not-found", "error"));
    if (order.status === "paid" && order.bookingId) return res.redirect(biopoolResultUrl(order.publicToken, "pagado"));
    const result = await commitTransaction(token);
    const validation = validateBiopoolPayment(order, result, token);
    if (!validation.approved) {
      await db.update(biopoolCheckoutOrders).set({
        status: isTransactionApproved(result.responseCode, result.status) ? "failed" : "rejected",
        webpayStatus: result.status,
        responseCode: result.responseCode,
        rawResponse: JSON.stringify(result),
        error: validation.reason,
        completedAt: new Date(),
      }).where(eq(biopoolCheckoutOrders.id, order.id));
      return res.redirect(biopoolResultUrl(order.publicToken, "rechazado"));
    }
    await finalizeApprovedBiopoolOrder(order.id, { kind: "webpay", result });
    return res.redirect(biopoolResultUrl(order.publicToken, "pagado"));
  } catch (error) {
    console.error("[biopools:webpay] Error procesando retorno", error);
    if (token) await db.update(biopoolCheckoutOrders).set({ error: String(error).slice(0, 2000) }).where(eq(biopoolCheckoutOrders.webpayToken, token));
    const [order] = token ? await db.select().from(biopoolCheckoutOrders).where(eq(biopoolCheckoutOrders.webpayToken, token)).limit(1) : [];
    return res.redirect(biopoolResultUrl(order?.publicToken || "error", "procesando"));
  }
});

export async function expireBiopoolCheckoutHolds(now = new Date()): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(biopoolCheckoutOrders).set({ status: "expired", error: "Tiempo de pago agotado" }).where(and(inArray(biopoolCheckoutOrders.status, ["initiating", "payment_pending"]), lt(biopoolCheckoutOrders.expiresAt, now)));
}

let schedulerStarted = false;
export function startBiopoolCheckoutScheduler(): void {
  if (schedulerStarted || process.env.NODE_ENV === "test") return;
  schedulerStarted = true;
  void expireBiopoolCheckoutHolds();
  const timer = setInterval(() => void expireBiopoolCheckoutHolds(), 60_000);
  timer.unref?.();
}

export default biopoolWebpayReturnRouter;
