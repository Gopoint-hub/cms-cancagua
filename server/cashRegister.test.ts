import { describe, expect, it } from "vitest";
import { calculateCashBalance } from "./cashRegister";

describe("Caja efectivo", () => {
  it("suma pagos de reservas e ingresos manuales y descuenta retiros", () => {
    expect(calculateCashBalance({
      reservationIncomeClp: 120_000,
      manualIncomeClp: 15_000,
      withdrawalsClp: 40_000,
    })).toEqual({
      reservationIncomeClp: 120_000,
      manualIncomeClp: 15_000,
      withdrawalsClp: 40_000,
      incomeClp: 135_000,
      balanceClp: 95_000,
    });
  });

  it("normaliza montos negativos sin aumentar artificialmente la caja", () => {
    expect(calculateCashBalance({
      reservationIncomeClp: -1,
      manualIncomeClp: -20,
      withdrawalsClp: -5,
    }).balanceClp).toBe(0);
  });
});
