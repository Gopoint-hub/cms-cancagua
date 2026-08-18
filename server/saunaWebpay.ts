import express from "express";
import { and, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  saunaBookings,
  saunaBlocks,
  saunaCheckoutOrders,
  saunaNotifications,
  saunaServices,
  reservationPayments,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import {
  commitTransaction,
  isTransactionApproved,
  refundTransaction,
} from "./webpay";
import { recordMassageDiscountUsage, resolveWellnessDiscountRequestId } from "./massageDiscounts";
import { buildSaunaNotificationSchedule } from "./saunaNotifications";
import { redeemGiftCardPayment } from "./reservationPayments";
import { availableSaunaSeats, saunaIntervalsOverlap } from "../shared/sauna";

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

export function canFinalizeSaunaCheckout(status: string): boolean {
  // Una orden expirada sí puede finalizar si el cupo continúa disponible. Las
  // órdenes abortadas, rechazadas, reembolsadas o en conciliación no pueden
  // volver a crear una reserva por un retorno repetido.
  return ["initiating", "payment_pending", "expired", "paid"].includes(status);
}

async function assertPaidOrderCapacity(tx: any, order: any): Promise<void> {
  const date = String(order.bookingDate).slice(0, 10);
  const [bookings, blocks, holds] = await Promise.all([
    tx
      .select()
      .from(saunaBookings)
      .where(
        and(
          eq(saunaBookings.bookingDate, date),
          ne(saunaBookings.status, "cancelled")
        )
      ),
    tx
      .select()
      .from(saunaBlocks)
      .where(and(eq(saunaBlocks.blockDate, date), eq(saunaBlocks.active, 1))),
    tx
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
          ne(saunaCheckoutOrders.id, order.id)
        )
      ),
  ]);
  const occupancy = [...bookings, ...blocks, ...holds]
    .filter(item =>
      saunaIntervalsOverlap(
        order.startTime,
        order.endTime,
        item.startTime,
        item.endTime
      )
    )
    .map((item: any) => ({
      guests: Number(item.guests ?? item.blockedCapacity ?? item.capacityUsed),
      capacityUsed: Number(item.capacityUsed ?? item.blockedCapacity),
      isPrivate: Number(item.isPrivate ?? 0),
      status: item.status,
    }));
  const available = availableSaunaSeats(occupancy);
  if (available < order.capacityUsed) {
    throw new Error(
      `El pago fue aprobado, pero el horario ya no tiene los ${order.capacityUsed} cupos requeridos`
    );
  }
}

async function refundApprovedSaunaPayment(input: {
  order: any;
  token: string;
  paymentResult: any;
  reason: unknown;
}): Promise<"paid" | "refunded" | "manual_review"> {
  const db = await getDb();
  if (!db) return "manual_review";
  const reason =
    input.reason instanceof Error ? input.reason.message : String(input.reason);
  const claim = await db.transaction(async tx => {
    await tx.execute(
      sql`SELECT id FROM sauna_checkout_orders WHERE id = ${input.order.id} FOR UPDATE`
    );
    const [current] = await tx
      .select()
      .from(saunaCheckoutOrders)
      .where(eq(saunaCheckoutOrders.id, input.order.id))
      .limit(1);
    if (!current) throw new Error("Orden Sauna no encontrada");
    if (current.status === "paid" && current.bookingId) return "paid" as const;
    if (current.status === "refunded") return "refunded" as const;
    if (current.status === "manual_review") return "manual_review" as const;
    // Reclamar la orden antes de llamar a Transbank impide que otro retorno
    // simultáneo cree la reserva o solicite un segundo reembolso.
    await tx
      .update(saunaCheckoutOrders)
      .set({
        status: "manual_review",
        webpayStatus: input.paymentResult.status,
        responseCode: input.paymentResult.responseCode,
        authorizationCode: input.paymentResult.authorizationCode,
        cardNumber: input.paymentResult.cardNumber,
        paymentTypeCode: input.paymentResult.paymentTypeCode,
        transactionDate: input.paymentResult.transactionDate,
        rawResponse: JSON.stringify({
          payment: input.paymentResult,
          automaticRefund: "processing",
        }),
        error: `${reason}. Reembolso automático en proceso.`.slice(0, 2000),
        paidAt: new Date(),
      })
      .where(eq(saunaCheckoutOrders.id, input.order.id));
    return "claimed" as const;
  });
  if (claim !== "claimed") return claim;
  try {
    const amount = Number(input.paymentResult.amount || input.order.totalClp);
    const refund = await refundTransaction(input.token, amount);
    await db
      .update(saunaCheckoutOrders)
      .set({
        status: "refunded",
        webpayStatus: "REFUNDED",
        responseCode: input.paymentResult.responseCode,
        authorizationCode: input.paymentResult.authorizationCode,
        cardNumber: input.paymentResult.cardNumber,
        paymentTypeCode: input.paymentResult.paymentTypeCode,
        transactionDate: input.paymentResult.transactionDate,
        rawResponse: JSON.stringify({
          payment: input.paymentResult,
          refund,
          automaticRefund: true,
        }),
        error: `${reason}. Reembolso automático solicitado.`.slice(0, 2000),
        paidAt: new Date(),
        completedAt: new Date(),
      })
      .where(eq(saunaCheckoutOrders.id, input.order.id));
    return "refunded";
  } catch (refundError) {
    await db
      .update(saunaCheckoutOrders)
      .set({
        status: "manual_review",
        webpayStatus: input.paymentResult.status,
        responseCode: input.paymentResult.responseCode,
        authorizationCode: input.paymentResult.authorizationCode,
        cardNumber: input.paymentResult.cardNumber,
        paymentTypeCode: input.paymentResult.paymentTypeCode,
        transactionDate: input.paymentResult.transactionDate,
        rawResponse: JSON.stringify({
          payment: input.paymentResult,
          automaticRefund: false,
        }),
        error:
          `${reason}. Falló el reembolso automático: ${String(refundError)}`.slice(
            0,
            2000
          ),
        paidAt: new Date(),
        completedAt: new Date(),
      })
      .where(eq(saunaCheckoutOrders.id, input.order.id));
    return "manual_review";
  }
}

export async function finalizeApprovedSaunaOrder(
  orderId: number,
  result: any
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const bookingId = await db.transaction(async tx => {
    const giftCardCode =
      result?.kind === "gift_card" ? String(result.code) : null;
    // Todas las operaciones que consumen aforo toman primero este mismo lock.
    // Se mantiene hasta COMMIT/ROLLBACK y evita sobreventas y deadlocks por
    // distinto orden de bloqueo entre el retorno de pago y la agenda.
    await tx.execute(
      sql`SELECT id FROM sauna_settings WHERE id = 1 FOR UPDATE`
    );
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
    if (!canFinalizeSaunaCheckout(order.status))
      throw new Error("Esta orden ya fue enviada a conciliación");
    await assertPaidOrderCapacity(tx, order);
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
        paymentReference:
          giftCardCode || result.authorizationCode || order.buyOrder,
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
      const gift = await redeemGiftCardPayment({
        tx,
        payment: {
          method: "gift_card",
          status: "paid",
          amountClp: order.totalClp,
          paidAt: paidAt.toISOString().slice(0, 16),
          giftCardCode,
        },
        totalClp: order.totalClp,
        module: "sauna",
        reservationId: created.id,
        note: `Canje web en Sauna ${created.id}`,
        serviceKey: "sauna",
      });
      await tx.insert(reservationPayments).values({
        module: "sauna",
        reservationId: created.id,
        method: "gift_card",
        status: "paid",
        amountClp: order.totalClp,
        paidAt,
        reference: gift.code,
        giftCardId: gift.id,
      });
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
        rawResponse: JSON.stringify(
          giftCardCode
            ? { paymentRequired: false, reason: "gift_card", giftCardCode }
            : result
        ),
        paidAt: new Date(),
        completedAt: new Date(),
        error: null,
      })
      .where(eq(saunaCheckoutOrders.id, order.id));
    return created.id;
  });

  // El uso del código se anota FUERA de la transacción, igual que en
  // Biopiscinas: si esto falla, la reserva ya quedó pagada y confirmada, que es
  // lo que no se puede perder.
  try {
    const [paidOrder] = await db
      .select()
      .from(saunaCheckoutOrders)
      .where(eq(saunaCheckoutOrders.id, orderId))
      .limit(1);
    if (paidOrder?.discountCodeId && paidOrder.discountClp > 0) {
      await recordMassageDiscountUsage(db, {
        discountCodeId: paidOrder.discountCodeId,
        requestId: await resolveWellnessDiscountRequestId(
          db,
          "sauna",
          paidOrder.id,
          paidOrder.buyOrder || paidOrder.publicToken,
        ),
        email: paidOrder.clientEmail,
        originalAmount: paidOrder.subtotalClp,
        discountAmount: paidOrder.discountClp,
        finalAmount: paidOrder.totalClp,
      });
    }
  } catch (error) {
    console.error(
      "[sauna:checkout] Reserva confirmada; no se pudo registrar el uso del descuento",
      { orderId, error }
    );
  }

  // Confirmación al cliente (mail + WhatsApp) y copia a recepción. Va encolado y
  // fuera de la transacción: la reserva ya está pagada y no se puede perder
  // porque un proveedor de envío esté caído. El chequeo previo evita duplicar si
  // el retorno de Webpay se reprocesa.
  try {
    const yaEncoladas = await db
      .select({ id: saunaNotifications.id })
      .from(saunaNotifications)
      .where(eq(saunaNotifications.bookingId, bookingId))
      .limit(1);
    if (yaEncoladas.length === 0) {
      await db
        .insert(saunaNotifications)
        .values(buildSaunaNotificationSchedule({ bookingId }));
    }
  } catch (error) {
    console.error(
      "[sauna:checkout] Reserva confirmada; no se pudieron encolar las notificaciones",
      { orderId, bookingId, error }
    );
  }
  return bookingId;
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
      if (["initiating", "payment_pending", "expired"].includes(order.status)) {
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
    if (order.status === "refunded")
      return res.redirect(saunaResultUrl(order.publicToken, "reembolsado"));
    if (order.status === "manual_review")
      return res.redirect(saunaResultUrl(order.publicToken, "revision"));
    const result = await commitTransaction(token);
    const validation = validateSaunaPayment(order, result, token);
    if (!validation.approved) {
      if (isTransactionApproved(result.responseCode, result.status)) {
        const recovery = await refundApprovedSaunaPayment({
          order,
          token,
          paymentResult: result,
          reason:
            validation.reason || "La validación interna del pago no coincidió",
        });
        return res.redirect(
          saunaResultUrl(
            order.publicToken,
            recovery === "paid"
              ? "pagado"
              : recovery === "refunded"
                ? "reembolsado"
                : "revision"
          )
        );
      }
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
    try {
      await finalizeApprovedSaunaOrder(order.id, result);
      return res.redirect(saunaResultUrl(order.publicToken, "pagado"));
    } catch (finalizeError) {
      const [latest] = await db
        .select()
        .from(saunaCheckoutOrders)
        .where(eq(saunaCheckoutOrders.id, order.id))
        .limit(1);
      if (latest?.status === "paid" && latest.bookingId)
        return res.redirect(saunaResultUrl(order.publicToken, "pagado"));
      const recovery = await refundApprovedSaunaPayment({
        order,
        token,
        paymentResult: result,
        reason: finalizeError,
      });
      return res.redirect(
        saunaResultUrl(
          order.publicToken,
          recovery === "paid"
            ? "pagado"
            : recovery === "refunded"
              ? "reembolsado"
              : "revision"
        )
      );
    }
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
