import { describe, expect, it } from "vitest";
import {
  prepareSaunaTotalDefinition,
  resolveSyncedSaunaTotalClp,
  saunaBookingTotalSchema,
} from "./saunaPaymentTotal";

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
        nonRefundedPaymentsClp: 0,
        requestedAmountClp: 15_000,
      })
    ).toEqual({ minimumAmountClp: 0, paymentStatus: "pending" });
  });

  it("conserva un pago legacy y calcula el estado contra el nuevo total", () => {
    expect(
      prepareSaunaTotalDefinition({
        source: "skedu",
        status: "confirmed",
        currentAmountClp: 0,
        amountPaidClp: 15_000,
        nonRefundedPaymentsClp: 10_000,
        requestedAmountClp: 33_000,
      })
    ).toEqual({ minimumAmountClp: 15_000, paymentStatus: "partially_paid" });
  });

  it("reconoce una reserva ya cubierta al definir su total", () => {
    expect(
      prepareSaunaTotalDefinition({
        source: "cms",
        status: "confirmed",
        currentAmountClp: 0,
        amountPaidClp: 15_000,
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
        nonRefundedPaymentsClp: 10_000,
        requestedAmountClp: 24_999,
      })
    ).toThrow(/pagos o abonos/i);
  });
});
