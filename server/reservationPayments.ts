import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { CARD_PAYMENT_METHODS, RESERVATION_PAYMENT_METHODS } from "../shared/reservationPayments";
import { chileLocalDateTimeToUtc } from "./massageNps";
import { and, eq } from "drizzle-orm";
import { giftCards, giftCardTransactions } from "../drizzle/schema";
import { validateGiftCardRedemption, validateServiceGiftCardRedemption } from "./giftCardRedemption";
import { inferGiftCardServiceKey, type GiftCardServiceKey } from "@shared/giftCardServices";

export const reservationPaymentInputSchema = z.object({
  method: z.enum(RESERVATION_PAYMENT_METHODS),
  status: z.enum(["pending", "paid"]),
  amountClp: z.number().int().positive(),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional(),
  reference: z.string().trim().max(160).optional(),
  cardType: z.enum(["credit", "debit"]).optional(),
  giftCardCode: z.string().trim().min(1).max(20).optional(),
});

export type ReservationPaymentInput = z.infer<typeof reservationPaymentInputSchema>;

export const PROTECTED_ELECTRONIC_PAYMENT_METHODS = ["webpay", "webpay_plus", "getnet"] as const;

export function assertReservationPaymentEditable(payment: { method: string }): void {
  if (PROTECTED_ELECTRONIC_PAYMENT_METHODS.includes(payment.method as any)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Los pagos electrónicos confirmados por Webpay o Getnet están protegidos",
    });
  }
}

export function validateReservationPayment(payment: ReservationPaymentInput): void {
  if (payment.method === "pending_payment" && payment.status !== "pending") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Selecciona el medio de pago real antes de marcarlo como pagado" });
  }
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
  if (payment.status === "paid" && CARD_PAYMENT_METHODS.includes(payment.method) && !payment.cardType) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Indica si la tarjeta es de crédito o débito" });
  }
}

export function reservationPaymentDate(value?: string): Date | null {
  if (!value) return null;
  const [date, time] = value.split("T");
  return chileLocalDateTimeToUtc(date, time);
}

export async function redeemGiftCardPayment(params: {
  tx: any;
  payment: ReservationPaymentInput;
  totalClp: number;
  module: string;
  reservationId: number;
  note: string;
  serviceKey: GiftCardServiceKey;
}) {
  const { tx, payment, totalClp, module, reservationId, note, serviceKey } = params;
  const code = payment.giftCardCode!.trim().toUpperCase();
  const [card] = await tx.select().from(giftCards).where(eq(giftCards.code, code)).limit(1);
  if (!card) throw new TRPCError({ code: "BAD_REQUEST", message: `Gift Card ${code} no encontrada` });
  try {
    if (card.amount === 0) {
      validateServiceGiftCardRedemption({ status: card.status, purchaseStatus: card.purchaseStatus, amount: card.amount, expiresAt: card.expiresAt, serviceKey: card.serviceKey ?? inferGiftCardServiceKey(card.personalMessage), requestedServiceKey: serviceKey });
      if (payment.amountClp !== totalClp) throw new Error("Una Gift Card de servicio debe cubrir el total completo de la reserva");
    } else {
      validateGiftCardRedemption({ status: card.status, purchaseStatus: card.purchaseStatus, balance: card.balance, amount: payment.amountClp, expiresAt: card.expiresAt });
    }
  } catch (error) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "No se pudo validar la Gift Card" });
  }
  const redemptionAmount = card.amount === 0 ? 0 : payment.amountClp;
  const newBalance = card.amount === 0 ? 0 : card.balance - redemptionAmount;
  const fullyRedeemed = card.amount === 0 || newBalance === 0;
  const updateResult: any = await tx.update(giftCards).set({
    balance: newBalance,
    status: fullyRedeemed ? "redeemed" : "active",
    redeemedAt: fullyRedeemed ? new Date() : null,
  }).where(and(eq(giftCards.id, card.id), eq(giftCards.status, "active"), eq(giftCards.purchaseStatus, "completed"), eq(giftCards.balance, card.balance)));
  const affectedRows = Number(updateResult?.[0]?.affectedRows ?? updateResult?.affectedRows ?? 0);
  if (affectedRows !== 1) throw new TRPCError({ code: "CONFLICT", message: "La Gift Card cambió mientras se procesaba el canje. Intenta nuevamente" });
  await tx.insert(giftCardTransactions).values({
    giftCardId: card.id,
    transactionType: "redemption",
    amount: -redemptionAmount,
    balanceBefore: card.balance,
    balanceAfter: newBalance,
    orderType: `${module}_booking`,
    orderId: String(reservationId),
    notes: note,
  });
  return { id: card.id, code };
}
