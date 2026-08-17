import express from "express";
import { and, eq, inArray, lt } from "drizzle-orm";
import {
  biopoolCheckoutOrders,
  saunaCheckoutOrders,
  serviceCartCheckoutItems,
  serviceCartCheckoutOrders,
} from "../drizzle/schema";
import { getDb } from "./db";
import { finalizeApprovedBiopoolOrder } from "./biopoolWebpay";
import { finalizeApprovedSaunaOrder } from "./saunaWebpay";
import { serviceCartResultUrl, validateServiceCartPayment } from "./serviceCartCheckout";
import { commitTransaction, refundTransaction } from "./webpay";

const router = express.Router();

function parseWebpayPayload(req: express.Request) {
  return {
    token: String(req.body?.token_ws || req.query?.token_ws || ""),
    abortedBuyOrder: String(req.body?.TBK_ORDEN_COMPRA || req.query?.TBK_ORDEN_COMPRA || ""),
    abortedSession: String(req.body?.TBK_ID_SESION || req.query?.TBK_ID_SESION || ""),
  };
}

async function markChildren(orderId: number, status: "aborted" | "rejected" | "expired" | "failed", error: string) {
  const db = await getDb();
  if (!db) return;
  const items = await db.select().from(serviceCartCheckoutItems).where(eq(serviceCartCheckoutItems.cartOrderId, orderId));
  for (const item of items) {
    if (item.module === "biopools") await db.update(biopoolCheckoutOrders).set({ status, error }).where(eq(biopoolCheckoutOrders.id, item.childOrderId));
    else await db.update(saunaCheckoutOrders).set({ status, error }).where(eq(saunaCheckoutOrders.id, item.childOrderId));
  }
}

router.all("/return", async (req, res) => {
  const db = await getDb();
  if (!db) return res.status(503).send("Base de datos no disponible");
  const { token, abortedBuyOrder, abortedSession } = parseWebpayPayload(req);
  try {
    if (!token && abortedBuyOrder && abortedSession) {
      const [order] = await db.select().from(serviceCartCheckoutOrders).where(and(eq(serviceCartCheckoutOrders.buyOrder, abortedBuyOrder), eq(serviceCartCheckoutOrders.sessionId, abortedSession))).limit(1);
      if (!order) return res.redirect(serviceCartResultUrl("error", "abortado"));
      if (order.status !== "paid") {
        await db.update(serviceCartCheckoutOrders).set({ status: "aborted", error: "Pago abortado por la persona" }).where(eq(serviceCartCheckoutOrders.id, order.id));
        await markChildren(order.id, "aborted", "Pago abortado en el carrito compartido");
      }
      return res.redirect(serviceCartResultUrl(order.publicToken, "abortado"));
    }
    if (!token) return res.redirect(serviceCartResultUrl("error", "procesando"));
    const [order] = await db.select().from(serviceCartCheckoutOrders).where(eq(serviceCartCheckoutOrders.webpayToken, token)).limit(1);
    if (!order) return res.redirect(serviceCartResultUrl("error", "procesando"));
    if (order.status === "paid") return res.redirect(serviceCartResultUrl(order.publicToken, "pagado"));
    if (order.status === "refunded") return res.redirect(serviceCartResultUrl(order.publicToken, "reembolsado"));
    if (order.status === "manual_review") return res.redirect(serviceCartResultUrl(order.publicToken, "revision"));

    const result = await commitTransaction(token);
    const validation = validateServiceCartPayment(order, result, token);
    if (!validation.approved) {
      await db.update(serviceCartCheckoutOrders).set({
        status: "rejected",
        webpayStatus: result.status,
        responseCode: result.responseCode,
        rawResponse: JSON.stringify(result),
        error: validation.reason || "La respuesta de Webpay no corresponde al carrito o el pago fue rechazado",
        completedAt: new Date(),
      }).where(eq(serviceCartCheckoutOrders.id, order.id));
      await markChildren(order.id, "rejected", "Pago rechazado en el carrito compartido");
      return res.redirect(serviceCartResultUrl(order.publicToken, "rechazado"));
    }

    const items = await db.select().from(serviceCartCheckoutItems).where(eq(serviceCartCheckoutItems.cartOrderId, order.id));
    // El retorno aprobado extiende brevemente los holds para que ninguna línea
    // pierda cupo mientras se confirman todas las reservas del mismo pago.
    const finalizeUntil = new Date(Date.now() + 10 * 60_000);
    await db.transaction(async tx => {
      await tx.update(serviceCartCheckoutOrders).set({ expiresAt: finalizeUntil }).where(eq(serviceCartCheckoutOrders.id, order.id));
      for (const item of items) {
        if (item.module === "biopools") await tx.update(biopoolCheckoutOrders).set({ status: "payment_pending", expiresAt: finalizeUntil }).where(eq(biopoolCheckoutOrders.id, item.childOrderId));
        else await tx.update(saunaCheckoutOrders).set({ status: "payment_pending", expiresAt: finalizeUntil }).where(eq(saunaCheckoutOrders.id, item.childOrderId));
      }
    });

    try {
      for (const item of items) {
        if (item.module === "biopools") await finalizeApprovedBiopoolOrder(item.childOrderId, { kind: "webpay", result });
        else await finalizeApprovedSaunaOrder(item.childOrderId, result);
      }
      await db.update(serviceCartCheckoutOrders).set({
        status: "paid",
        webpayStatus: result.status,
        responseCode: result.responseCode,
        authorizationCode: result.authorizationCode,
        cardNumber: result.cardNumber,
        paymentTypeCode: result.paymentTypeCode,
        transactionDate: result.transactionDate,
        rawResponse: JSON.stringify(result),
        error: null,
        paidAt: new Date(),
        completedAt: new Date(),
      }).where(eq(serviceCartCheckoutOrders.id, order.id));
      return res.redirect(serviceCartResultUrl(order.publicToken, "pagado"));
    } catch (error) {
      const childStates = await Promise.all(items.map(async item => {
        if (item.module === "biopools") return (await db.select({ status: biopoolCheckoutOrders.status }).from(biopoolCheckoutOrders).where(eq(biopoolCheckoutOrders.id, item.childOrderId)).limit(1))[0]?.status;
        return (await db.select({ status: saunaCheckoutOrders.status }).from(saunaCheckoutOrders).where(eq(saunaCheckoutOrders.id, item.childOrderId)).limit(1))[0]?.status;
      }));
      const anyFinalized = childStates.some(status => status === "paid");
      if (!anyFinalized) {
        try {
          const refund = await refundTransaction(token, order.totalClp);
          await db.update(serviceCartCheckoutOrders).set({ status: "refunded", webpayStatus: "REFUNDED", rawResponse: JSON.stringify({ payment: result, refund }), error: `No se pudieron confirmar los cupos. Reembolso automático solicitado: ${String(error)}`.slice(0, 2000), paidAt: new Date(), completedAt: new Date() }).where(eq(serviceCartCheckoutOrders.id, order.id));
          await markChildren(order.id, "failed", "Pago reembolsado porque no se pudieron confirmar todos los cupos");
          return res.redirect(serviceCartResultUrl(order.publicToken, "reembolsado"));
        } catch (refundError) {
          await db.update(serviceCartCheckoutOrders).set({ status: "manual_review", rawResponse: JSON.stringify(result), error: `Falló la confirmación y el reembolso automático: ${String(error)} / ${String(refundError)}`.slice(0, 2000), paidAt: new Date(), completedAt: new Date() }).where(eq(serviceCartCheckoutOrders.id, order.id));
          return res.redirect(serviceCartResultUrl(order.publicToken, "revision"));
        }
      }
      await db.update(serviceCartCheckoutOrders).set({ status: "manual_review", rawResponse: JSON.stringify(result), error: `Una parte del carrito quedó confirmada y requiere conciliación: ${String(error)}`.slice(0, 2000), paidAt: new Date(), completedAt: new Date() }).where(eq(serviceCartCheckoutOrders.id, order.id));
      return res.redirect(serviceCartResultUrl(order.publicToken, "revision"));
    }
  } catch (error) {
    console.error("[service-cart:webpay] Error procesando retorno", error);
    const [order] = token ? await db.select().from(serviceCartCheckoutOrders).where(eq(serviceCartCheckoutOrders.webpayToken, token)).limit(1) : [];
    if (order) await db.update(serviceCartCheckoutOrders).set({ error: String(error).slice(0, 2000) }).where(eq(serviceCartCheckoutOrders.id, order.id));
    return res.redirect(serviceCartResultUrl(order?.publicToken || "error", "procesando"));
  }
});

export async function expireServiceCartCheckoutHolds(now = new Date()): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const expired = await db.select({ id: serviceCartCheckoutOrders.id }).from(serviceCartCheckoutOrders).where(and(inArray(serviceCartCheckoutOrders.status, ["initiating", "payment_pending"]), lt(serviceCartCheckoutOrders.expiresAt, now)));
  for (const order of expired) {
    await db.update(serviceCartCheckoutOrders).set({ status: "expired", error: "Tiempo de pago agotado" }).where(eq(serviceCartCheckoutOrders.id, order.id));
    await markChildren(order.id, "expired", "Tiempo de pago del carrito agotado");
  }
}

let schedulerStarted = false;
export function startServiceCartCheckoutScheduler(): void {
  if (schedulerStarted || process.env.NODE_ENV === "test") return;
  schedulerStarted = true;
  void expireServiceCartCheckoutHolds();
  const timer = setInterval(() => void expireServiceCartCheckoutHolds(), 60_000);
  timer.unref?.();
}

export default router;
