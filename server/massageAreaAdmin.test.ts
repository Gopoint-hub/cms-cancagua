import { describe, expect, it } from "vitest";
import {
  calculateMassageCloseTotals,
  getMassageClosePeriod,
  isMassageConsideredCompleted,
  MASSAGE_CLOSE_DEFAULTS,
} from "./massageAreaAdmin";

describe("cierre mensual del área de masajes", () => {
  it("calcula el período desde el 25 anterior al 24 del mes de cierre, incluso entre años", () => {
    expect(getMassageClosePeriod("2027-01")).toEqual({
      start: "2026-12-25",
      end: "2027-01-24",
    });
  });

  it("considera realizado un masaje confirmado cuando su hora ya terminó en Chile", () => {
    const now = new Date("2026-07-23T19:30:00.000Z"); // 15:30 en Chile continental
    expect(isMassageConsideredCompleted("confirmed", "2026-07-23", "15:00", now)).toBe(true);
    expect(isMassageConsideredCompleted("confirmed", "2026-07-23", "16:00", now)).toBe(false);
    expect(isMassageConsideredCompleted("pending", "2026-07-22", "10:00", now)).toBe(false);
    expect(isMassageConsideredCompleted("completed", "2026-07-24", "18:00", now)).toBe(true);
  });

  it("usa $707 por masaje y descuenta cada comisión una sola vez", () => {
    const parameters = {
      ...MASSAGE_CLOSE_DEFAULTS,
      laundryUnitCost: 0,
      regularTransportCost: 0,
      electricityCost: 0,
      accountingCost: 0,
      tamaraBaseSalary: 0,
      barbaraBaseSalary: 0,
      danielaBaseSalary: 0,
      previredRate: 0,
      freelanceTripCount: 0,
    };
    const details = [
      {
        grossRevenue: 100_000,
        originalAmount: 100_000,
        discountAmount: 0,
        therapistType: "inhouse",
        commission: 20_000,
      },
      {
        grossRevenue: 50_000,
        originalAmount: 50_000,
        discountAmount: 0,
        therapistType: "freelance",
        commission: 25_000,
      },
    ] as any;
    const result = calculateMassageCloseTotals(details, parameters, []);
    expect(result.costs.supplies).toBe(1_414);
    expect(result.inhouseCommissions).toBe(20_000);
    expect(result.freelanceCommissions).toBe(25_000);
    expect(result.operationalResult).toBe(103_586);
    expect(result.tamaraBonus).toBe(10_359);
    expect(result.unitResult).toBe(93_227);
  });

  it("no genera un bono negativo cuando el resultado operacional es pérdida", () => {
    const parameters = {
      ...MASSAGE_CLOSE_DEFAULTS,
      barbaraBaseSalary: 0,
      danielaBaseSalary: 0,
    };
    const result = calculateMassageCloseTotals([], parameters, []);
    expect(result.operationalResult).toBeLessThan(0);
    expect(result.tamaraBonus).toBe(0);
  });
});
