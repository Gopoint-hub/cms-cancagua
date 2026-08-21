import { TRPCError } from "@trpc/server";
import { hasGiftCardAccess, type PermissionUser } from "@shared/permissions";
import {
  giftCardServiceMatches,
  type GiftCardServiceKey,
} from "@shared/giftCardServices";

export function canRedeemGiftCard(user: PermissionUser): boolean {
  return hasGiftCardAccess(user);
}

export function assertGiftCardPaymentRemovalAccess(
  user: PermissionUser,
  payment?:
    | { method?: string | null; giftCardId?: number | null }
    | number
    | null
): void {
  const isGiftCardPayment =
    typeof payment === "number" ||
    (typeof payment === "object" &&
      payment !== null &&
      (payment.giftCardId != null || payment.method === "gift_card"));
  if (isGiftCardPayment && !canRedeemGiftCard(user)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No tienes permisos para modificar Gift Cards",
    });
  }
}

export function validateServiceGiftCardRedemption(input: {
  status: string;
  purchaseStatus: string;
  amount: number;
  expiresAt?: Date | null;
  serviceKey?: string | null;
  requestedServiceKey?: GiftCardServiceKey;
}): void {
  if (input.purchaseStatus !== "completed") {
    throw new Error("La Gift Card no tiene una compra completada");
  }
  if (input.amount !== 0) {
    throw new Error("Esta Gift Card se canjea por monto");
  }
  if (input.status !== "active") {
    throw new Error("La Gift Card no está activa");
  }
  if (input.expiresAt && input.expiresAt < new Date()) {
    throw new Error("La Gift Card está vencida");
  }
  if (
    input.requestedServiceKey &&
    !giftCardServiceMatches(input.serviceKey, input.requestedServiceKey)
  ) {
    if (input.serviceKey === "mixed_program")
      throw new Error(
        "Esta Gift Card corresponde a un programa que todavía no está habilitado en el CMS"
      );
    throw new Error("Esta Gift Card no corresponde al servicio seleccionado");
  }
}

export function validateGiftCardRedemption(input: {
  status: string;
  purchaseStatus: string;
  balance: number;
  amount: number;
  expiresAt?: Date | null;
}): void {
  if (input.purchaseStatus !== "completed") {
    throw new Error("La Gift Card no tiene una compra completada");
  }
  if (input.status !== "active") {
    throw new Error("La Gift Card no está activa");
  }
  if (input.expiresAt && input.expiresAt < new Date()) {
    throw new Error("La Gift Card está vencida");
  }
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error("El monto a canjear debe ser un número entero positivo");
  }
  if (input.amount > input.balance) {
    throw new Error("El monto supera el saldo disponible");
  }
}
