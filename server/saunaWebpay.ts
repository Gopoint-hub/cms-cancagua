import express from "express";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  saunaBookings,
  saunaCheckoutOrders,
  saunaServices,
  reservationPayments,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { commitTransaction, isTransactionApproved } from "./webpay";
import { redeemGiftCardPayment } from "./reservationPayments";

export function saunaResultUrl(publicToken: string, state: string): string {
  const frontend = (
    ENV.frontendUrl ||
    ENV.appUrl ||
    "https://cancagua.cl"
  ).replace(/\/$/, "");
  return `${frontend}/sauna/pago/resultado?order=${encodeURIComponent(publicToken)}&estado=${encodeURIComponent(state)}`;
}

export function validateSaunaPayment(
  order: {
    webpayToken: string | null;
    buyOrder: string | null;
    sessionId: string | null;
    totalClp: number;
  },
  result: {
    buyOrder: string;
    sessionId: string;
    amount: number;
    responseCode: number;
    status: string;
  },
  token: string
): { approved: boolean; reason?: string } {
  if (!order.webpayToken || order.webpayToken !== token)
    return { approved: false, reason: "Token Webpay no corresponde" };
  if (!order.buyOrder || order.buyOrder !== result.buyOrder)
    return { approved: false, reason: "Orden Webpay no corresponde" };
  if (!order.sessionId || order.sessionId !== result.sessionId)
    return { approved: false, reason: "Sesión Webpay no corresponde" };
  if (Number(result.amount) !== order.totalClp)
    return { approved: false, reason: "Monto Webpay no corresponde" };
  if (!isTransactionApproved(result.responseCode, result.status))
    return { approved: false, reason: "Pago rechazado por Webpay" };
  return { approved: true };
}

export async function finalizeApprovedSaunaOrder(
  orderId: number,
  result: any
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  return db.transaction(async tx => {
    const giftCardCode = result?.kind === "gift_card" ? String(result.code) : null;
    await tx.execute(
      sql`SELECT id FROM sauna_checkout_orders WHERE id = ${orderId} FOR UPDATE`
    );
    const [order] = await tx
      .select()
      .from(saunaCheckoutOrders)
      .where(eq(saunaCheckoutOrders.id, orderId))
      .limit(1);
    if (!order) throw new Error("Orden Sauna no encontrada");
    if (order.bookingId && order.status === "paid") return order.bookingId;
    if (order.expiresAt < new Date())
      throw new Error("La reserva temporal de cupos expiró");
    const [service] = await tx
      .select()
      .from(saunaServices)
      .where(eq(saunaServices.id, order.serviceId))
      .limit(1);
    if (!service) throw new Error("Servicio Sauna no encontrado");

    const [created] = await tx
      .insert(saunaBookings)
      .values({
        bookingCode: `SAU-${String(order.bookingDate).slice(0, 10).replaceAll("-", "")}-${nanoid(6).toUpperCase()}`,
        skeduServiceUuid: service.skeduServiceUuid,
        serviceName: service.name,
        kind: order.isPrivate ? "private" : "shared",
        clientName: order.clientName,
        clientEmail: order.clientEmail,
        clientPhone: order.clientPhone,
        bookingDate: String(order.bookingDate).slice(0, 10),
        startTime: order.startTime,
        endTime: order.endTime,
        guests: order.guests,
        capacityUsed: order.capacityUsed,
        isPrivate: order.isPrivate,
        status: "confirmed",
        isConfirmed: 1,
        paymentStatus: "paid",
        paymentMethod: giftCardCode ? "gift_card" : "webpay_plus",
        paymentReference: giftCardCode || result.authorizationCode || order.buyOrder,
        amountClp: order.totalClp,
        amountPaidClp: order.totalClp,
        source: "web",
        origin: "web",
      })
      .$returningId();

    if (!giftCardCode) {
      await tx.insert(reservationPayments).values({
        module: "sauna",
        reservationId: created.id,
        method: "webpay_plus",
        status: "paid",
        amountClp: order.totalClp,
        paidAt: new Date(),
        reference: result.authorizationCode || order.buyOrder,
      });
    } else {
      const paidAt = new Date();
      const gift = await redeemGiftCardPayment({ tx, payment: { method: "gift_card", status: "paid", amountClp: order.totalClp, paidAt: paidAt.toISOString().slice(0, 16), giftCardCode }, totalClp: order.totalClp, module: "sauna", reservationId: created.id, note: `Canje web en Sauna ${created.id}`, serviceKey: "sauna" });
      await tx.insert(reservationPayments).values({ module: "sauna", reservationId: created.id, method: "gift_card", status: "paid", amountClp: order.totalClp, paidAt, reference: gift.code, giftCardId: gift.id });
    }

    await tx
      .update(saunaCheckoutOrders)
      .set({
        bookingId: created.id,
        status: "paid",
        webpayStatus: giftCardCode ? "NOT_REQUIRED" : result.status,
        responseCode: giftCardCode ? 0 : result.responseCode,
        authorizationCode: giftCardCode ? null : result.authorizationCode,
        cardNumber: giftCardCode ? null : result.cardNumber,
        paymentTypeCode: giftCardCode ? null : result.paymentTypeCode,
        transactionDate: giftCardCode ? null : result.transactionDate,
        rawResponse: JSON.stringify(giftCardCode ? { paymentRequired: false, reason: "gift_card", giftCardCode } : result),
        paidAt: new Date(),
        completedAt: new Date(),
        error: null,
      })
      .where(eq(saunaCheckoutOrders.id, order.id));
    return created.id;
  });
}

export const saunaWebpayReturnRouter = express.Router();

saunaWebpayReturnRouter.all("/return", async (req, res) => {
  const db = await getDb();
  if (!db) return res.redirect(saunaResultUrl("unavailable", "error"));
  const token = String(req.body?.token_ws || req.query?.token_ws || "");
  const abortedBuyOrder = String(
    req.body?.TBK_ORDEN_COMPRA || req.query?.TBK_ORDEN_COMPRA || ""
  );
  const abortedSession = String(
    req.body?.TBK_ID_SESION || req.query?.TBK_ID_SESION || ""
  );
  try {
    if (!token) {
      const [order] = await db
        .select()
        .from(saunaCheckoutOrders)
        .where(
          and(
            eq(saunaCheckoutOrders.buyOrder, abortedBuyOrder),
            eq(saunaCheckoutOrders.sessionId, abortedSession)
          )
        )
        .limit(1);
      if (!order) return res.redirect(saunaResultUrl("not-found", "abortado"));
      if (order.status !== "paid") {
        await db
          .update(saunaCheckoutOrders)
          .set({ status: "aborted", error: "Pago abortado por el usuario" })
          .where(eq(saunaCheckoutOrders.id, order.id));
      }
      return res.redirect(saunaResultUrl(order.publicToken, "abortado"));
    }

    const [order] = await db
      .select()
      .from(saunaCheckoutOrders)
      .where(eq(saunaCheckoutOrders.webpayToken, token))
      .limit(1);
    if (!order) return res.redirect(saunaResultUrl("not-found", "error"));
    if (order.status === "paid" && order.bookingId)
      return res.redirect(saunaResultUrl(order.publicToken, "pagado"));
    const result = await commitTransaction(token);
    const validation = validateSaunaPayment(order, result, token);
    if (!validation.approved) {
      await db
        .update(saunaCheckoutOrders)
        .set({
          status: isTransactionApproved(result.responseCode, result.status)
            ? "failed"
            : "rejected",
          webpayStatus: result.status,
          responseCode: result.responseCode,
          rawResponse: JSON.stringify(result),
          error: validation.reason,
          completedAt: new Date(),
        })
        .where(eq(saunaCheckoutOrders.id, order.id));
      return res.redirect(saunaResultUrl(order.publicToken, "rechazado"));
    }
    await finalizeApprovedSaunaOrder(order.id, result);
    return res.redirect(saunaResultUrl(order.publicToken, "pagado"));
  } catch (error) {
    console.error("[sauna:webpay] Error procesando retorno", error);
    const [order] = token
      ? await db
          .select()
          .from(saunaCheckoutOrders)
          .where(eq(saunaCheckoutOrders.webpayToken, token))
          .limit(1)
      : [];
    if (order)
      await db
        .update(saunaCheckoutOrders)
        .set({ error: String(error).slice(0, 2000) })
        .where(eq(saunaCheckoutOrders.id, order.id));
    return res.redirect(
      saunaResultUrl(order?.publicToken || "error", "procesando")
    );
  }
});

export async function expireSaunaCheckoutHolds(
  now = new Date()
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(saunaCheckoutOrders)
    .set({ status: "expired", error: "Tiempo de pago agotado" })
    .where(
      and(
        inArray(saunaCheckoutOrders.status, ["initiating", "payment_pending"]),
        lt(saunaCheckoutOrders.expiresAt, now)
      )
    );
}

let schedulerStarted = false;
export function startSaunaCheckoutScheduler(): void {
  if (schedulerStarted || process.env.NODE_ENV === "test") return;
  schedulerStarted = true;
  void expireSaunaCheckoutHolds();
  const timer = setInterval(() => void expireSaunaCheckoutHolds(), 60_000);
  timer.unref?.();
}

export default saunaWebpayReturnRouter;
