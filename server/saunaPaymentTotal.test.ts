import { describe, expect, it } from "vitest";
import {
  prepareSaunaBookingPaymentState,
  prepareSaunaPaymentUpdate,
  prepareSaunaTotalDefinition,
  resolveSyncedSaunaTotalClp,
  saunaBookingTotalSchema,
} from "./saunaPaymentTotal";
import {
  reservationPaymentInputSchema,
  validateReservationPayment,
} from "./reservationPayments";

describe("sincronización del total de Sauna desde Skedu", () => {
  it("preserva el total local definido cuando Skedu informa $0", () => {
    expect(resolveSyncedSaunaTotalClp(0, 33_000)).toBe(33_000);
  });

  it("acepta un total real positivo informado por Skedu", () => {
    expect(resolveSyncedSaunaTotalClp(40_000, 33_000)).toBe(40_000);
  });
});

describe("definición inicial del total de Sauna", () => {
  it("exige un monto entero positivo y no acepta total ausente", () => {
    expect(saunaBookingTotalSchema.safeParse(15_000).success).toBe(true);
    expect(saunaBookingTotalSchema.safeParse(0).success).toBe(false);
    expect(saunaBookingTotalSchema.safeParse(-1).success).toBe(false);
    expect(saunaBookingTotalSchema.safeParse(15_000.5).success).toBe(false);
    expect(saunaBookingTotalSchema.safeParse(undefined).success).toBe(false);
  });

  it("rescata una reserva CMS sin pagos como pendiente", () => {
    expect(
      prepareSaunaTotalDefinition({
        source: "cms",
        status: "confirmed",
        currentAmountClp: 0,
        amountPaidClp: 0,
        detailedPaymentCount: 0,
        nonRefundedPaymentsClp: 0,
        requestedAmountClp: 15_000,
      })
    ).toEqual({
      minimumAmountClp: 0,
      shouldCreatePendingPayment: true,
      paymentStatus: "pending",
    });
  });

  it("conserva un pago legacy y calcula el estado contra el nuevo total", () => {
    expect(
      prepareSaunaTotalDefinition({
        source: "skedu",
        status: "confirmed",
        currentAmountClp: 0,
        amountPaidClp: 15_000,
        detailedPaymentCount: 0,
        nonRefundedPaymentsClp: 0,
        requestedAmountClp: 33_000,
      })
    ).toEqual({
      minimumAmountClp: 15_000,
      shouldCreatePendingPayment: false,
      paymentStatus: "partially_paid",
    });
  });

  it("no duplica una fila pendiente ya existente", () => {
    expect(
      prepareSaunaTotalDefinition({
        source: "cms",
        status: "confirmed",
        currentAmountClp: 0,
        amountPaidClp: 0,
        detailedPaymentCount: 1,
        nonRefundedPaymentsClp: 15_000,
        requestedAmountClp: 15_000,
      }).shouldCreatePendingPayment
    ).toBe(false);
  });

  it("reconoce una reserva ya cubierta al definir su total", () => {
    expect(
      prepareSaunaTotalDefinition({
        source: "cms",
        status: "confirmed",
        currentAmountClp: 0,
        amountPaidClp: 15_000,
        detailedPaymentCount: 1,
        nonRefundedPaymentsClp: 15_000,
        requestedAmountClp: 15_000,
      }).paymentStatus
    ).toBe("paid");
  });

  it.each([
    [
      "cancelada",
      {
        source: "cms",
        status: "cancelled",
        currentAmountClp: 0,
        amountPaidClp: 0,
        detailedPaymentCount: 0,
        nonRefundedPaymentsClp: 0,
        requestedAmountClp: 15_000,
      },
      /cancelada/i,
    ],
    [
      "web",
      {
        source: "web",
        status: "confirmed",
        currentAmountClp: 0,
        amountPaidClp: 0,
        detailedPaymentCount: 0,
        nonRefundedPaymentsClp: 0,
        requestedAmountClp: 15_000,
      },
      /checkout/i,
    ],
    [
      "con total previo",
      {
        source: "cms",
        status: "confirmed",
        currentAmountClp: 15_000,
        amountPaidClp: 0,
        detailedPaymentCount: 0,
        nonRefundedPaymentsClp: 0,
        requestedAmountClp: 20_000,
      },
      /ya tiene/i,
    ],
  ])("rechaza una reserva %s", (_label, input, message) => {
    expect(() => prepareSaunaTotalDefinition(input)).toThrow(message);
  });

  it("no permite un total inferior a pagos o abonos no reembolsados", () => {
    expect(() =>
      prepareSaunaTotalDefinition({
        source: "skedu",
        status: "confirmed",
        currentAmountClp: 0,
        amountPaidClp: 10_000,
        detailedPaymentCount: 1,
        nonRefundedPaymentsClp: 20_000,
        requestedAmountClp: 19_999,
      })
    ).toThrow(/pagos o abonos/i);
  });

  it("también respeta amountPaidClp si supera las líneas detalladas", () => {
    expect(() =>
      prepareSaunaTotalDefinition({
        source: "cms",
        status: "confirmed",
        currentAmountClp: 0,
        amountPaidClp: 25_000,
        detailedPaymentCount: 1,
        nonRefundedPaymentsClp: 10_000,
        requestedAmountClp: 24_999,
      })
    ).toThrow(/pagos o abonos/i);
  });
});

describe("contrato de pagos manuales de Sauna", () => {
  it("crea una reserva con total positivo y pendiente sin filas", () => {
    expect(
      prepareSaunaBookingPaymentState({
        totalAmountClp: 15_000,
        declaredPaymentStatus: "pending",
        payments: [],
      })
    ).toEqual({
      paymentStatus: "pending",
      paymentMethod: null,
      amountPaidClp: 0,
    });
  });

  it("crea una reserva con una fila pending_payment por el total", () => {
    expect(
      prepareSaunaBookingPaymentState({
        totalAmountClp: 15_000,
        declaredPaymentStatus: "pending",
        payments: [
          {
            method: "pending_payment",
            status: "pending",
            amountClp: 15_000,
          },
        ],
      })
    ).toEqual({
      paymentStatus: "pending",
      paymentMethod: "pending_payment",
      amountPaidClp: 0,
    });
  });

  it("convierte la fila pendiente a transferencia pagada sin duplicar el total", () => {
    const replacement = reservationPaymentInputSchema.parse({
      method: "bank_transfer",
      status: "paid",
      amountClp: 15_000,
      paidAt: "2026-08-21T16:30",
      reference: "TR-15000",
    });
    expect(() => validateReservationPayment(replacement)).not.toThrow();
    expect(
      prepareSaunaPaymentUpdate({
        totalAmountClp: 15_000,
        currentAmountPaidClp: 0,
        targetPaymentId: 7,
        rows: [
          { id: 7, status: "pending", amountClp: 15_000 },
        ],
        replacement,
      })
    ).toEqual({
      legacyAmountPaidClp: 0,
      newAmountPaidClp: 15_000,
      paymentStatus: "paid",
    });
  });

  it("rechaza una conversión que excede el total de la reserva", () => {
    expect(() =>
      prepareSaunaPaymentUpdate({
        totalAmountClp: 15_000,
        currentAmountPaidClp: 0,
        targetPaymentId: 7,
        rows: [{ id: 7, status: "pending", amountClp: 15_000 }],
        replacement: { status: "paid", amountClp: 15_001 },
      })
    ).toThrow(/superan el total/i);
  });
});
