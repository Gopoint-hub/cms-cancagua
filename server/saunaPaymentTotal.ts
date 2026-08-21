import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { calculatedPaymentStatus } from "../shared/reservationPayments";

export const saunaBookingTotalSchema = z
  .number()
  .int()
  .positive("El valor total de la reserva debe ser mayor a $0");

export type SaunaTotalDefinitionInput = {
  source: string;
  status: string;
  currentAmountClp: number;
  amountPaidClp: number;
  nonRefundedPaymentsClp: number;
  requestedAmountClp: number;
};

export function resolveSyncedSaunaTotalClp(
  externalAmountClp: number,
  currentAmountClp: number
): number {
  return externalAmountClp > 0 ? externalAmountClp : currentAmountClp;
}

/**
 * Valida la única transición permitida para rescatar una reserva Sauna sin
 * precio. El total no se usa como editor general: una vez definido, cualquier
 * corrección requiere un flujo financiero explícito y auditable.
 */
export function prepareSaunaTotalDefinition(input: SaunaTotalDefinitionInput) {
  if (input.status === "cancelled") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No se puede definir el total de una reserva cancelada",
    });
  }
  if (input.source === "web") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "El total de una reserva web lo define el checkout y no se puede modificar",
    });
  }
  if (input.currentAmountClp > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "La reserva ya tiene un valor total definido",
    });
  }

  const minimumAmountClp = Math.max(
    0,
    input.amountPaidClp,
    input.nonRefundedPaymentsClp
  );
  if (input.requestedAmountClp < minimumAmountClp) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "El valor total no puede ser inferior a los pagos o abonos ya registrados",
    });
  }

  return {
    minimumAmountClp,
    paymentStatus: calculatedPaymentStatus(
      input.amountPaidClp,
      input.requestedAmountClp
    ),
  };
}
