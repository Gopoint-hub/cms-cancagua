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
  detailedPaymentCount: number;
  nonRefundedPaymentsClp: number;
  requestedAmountClp: number;
};

export type SaunaPaymentUpdateRow = {
  id: number;
  status: string;
  amountClp: number;
};

export function prepareSaunaBookingPaymentState(input: {
  totalAmountClp: number;
  declaredPaymentStatus: "unknown" | "pending" | "paid";
  declaredPaymentMethod?: string;
  payments: Array<{
    method: string;
    status: "pending" | "paid";
    amountClp: number;
  }>;
}) {
  const plannedAmountClp = input.payments.reduce(
    (sum, payment) => sum + payment.amountClp,
    0
  );
  if (plannedAmountClp > input.totalAmountClp) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Los pagos superan el total de la reserva",
    });
  }
  const paidAmountClp = input.payments
    .filter(payment => payment.status === "paid")
    .reduce((sum, payment) => sum + payment.amountClp, 0);
  return {
    paymentStatus: input.payments.length
      ? calculatedPaymentStatus(paidAmountClp, input.totalAmountClp)
      : input.declaredPaymentStatus,
    paymentMethod:
      input.payments.length > 1
        ? "mixed"
        : input.payments[0]?.method || input.declaredPaymentMethod || null,
    amountPaidClp: input.payments.length
      ? paidAmountClp
      : input.declaredPaymentStatus === "paid"
        ? input.totalAmountClp
        : 0,
  };
}

export function prepareSaunaPaymentUpdate(input: {
  totalAmountClp: number;
  currentAmountPaidClp: number;
  targetPaymentId: number;
  rows: SaunaPaymentUpdateRow[];
  replacement: { status: "pending" | "paid"; amountClp: number };
}) {
  const detailedPaidClp = input.rows
    .filter(row => row.status === "paid")
    .reduce((sum, row) => sum + row.amountClp, 0);
  const legacyAmountPaidClp = Math.max(
    0,
    input.currentAmountPaidClp - detailedPaidClp
  );
  const otherRows = input.rows.filter(
    row => row.id !== input.targetPaymentId && row.status !== "refunded"
  );
  const otherPlannedClp = otherRows.reduce(
    (sum, row) => sum + row.amountClp,
    0
  );
  if (
    legacyAmountPaidClp + otherPlannedClp + input.replacement.amountClp >
    input.totalAmountClp
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Los pagos superan el total de la reserva",
    });
  }

  const newAmountPaidClp =
    legacyAmountPaidClp +
    otherRows
      .filter(row => row.status === "paid")
      .reduce((sum, row) => sum + row.amountClp, 0) +
    (input.replacement.status === "paid" ? input.replacement.amountClp : 0);
  return {
    legacyAmountPaidClp,
    newAmountPaidClp,
    paymentStatus: calculatedPaymentStatus(
      newAmountPaidClp,
      input.totalAmountClp
    ),
  };
}

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
    shouldCreatePendingPayment:
      input.detailedPaymentCount === 0 && input.amountPaidClp === 0,
    paymentStatus: calculatedPaymentStatus(
      input.amountPaidClp,
      input.requestedAmountClp
    ),
  };
}
