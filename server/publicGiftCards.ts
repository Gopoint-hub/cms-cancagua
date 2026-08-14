import { TRPCError } from "@trpc/server";
import type { GiftCard } from "../drizzle/schema";
import {
  inferGiftCardServiceKey,
  type GiftCardServiceKey,
} from "@shared/giftCardServices";
import {
  validateGiftCardRedemption,
  validateServiceGiftCardRedemption,
} from "./giftCardRedemption";

export function validatePublicGiftCard(
  card: GiftCard | undefined,
  requestedServiceKey: GiftCardServiceKey,
  totalClp: number
) {
  if (!card)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Gift Card no encontrada",
    });
  if (!Number.isInteger(totalClp) || totalClp <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No hay un total válido para aplicar la Gift Card",
    });
  }
  try {
    if (card.amount === 0 || card.redemptionMode === "service") {
      validateServiceGiftCardRedemption({
        status: card.status,
        purchaseStatus: card.purchaseStatus,
        amount: card.amount,
        expiresAt: card.expiresAt,
        serviceKey:
          card.serviceKey ?? inferGiftCardServiceKey(card.personalMessage),
        requestedServiceKey,
      });
      return {
        code: card.code,
        mode: "service" as const,
        appliedClp: totalClp,
        balanceAfter: 0,
      };
    }
    validateGiftCardRedemption({
      status: card.status,
      purchaseStatus: card.purchaseStatus,
      balance: card.balance,
      amount: totalClp,
      expiresAt: card.expiresAt,
    });
    return {
      code: card.code,
      mode: "amount" as const,
      appliedClp: totalClp,
      balanceAfter: card.balance - totalClp,
    };
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        error instanceof Error
          ? error.message
          : "No se pudo validar la Gift Card",
    });
  }
}
