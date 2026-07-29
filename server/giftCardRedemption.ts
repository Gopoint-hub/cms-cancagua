import { hasB2CAccess } from "@shared/permissions";

export function canRedeemGiftCard(role?: string | null): boolean {
  return hasB2CAccess(role);
}

export function validateServiceGiftCardRedemption(input: {
  status: string;
  purchaseStatus: string;
  amount: number;
  expiresAt?: Date | null;
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
