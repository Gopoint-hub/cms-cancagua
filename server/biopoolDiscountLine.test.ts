import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildBiopoolDiscountLine } from "./biopoolDiscountLine";
import {
  calculateWellnessDiscountAmounts,
  weekdayOfBookingDate,
} from "./massageDiscounts";

describe("línea de descuento de Biopiscinas", () => {
  it("entrega una unidad por entrada para calcular correctamente un 2x1", () => {
    const line = buildBiopoolDiscountLine({
      serviceId: 1,
      adultQuantity: 4,
      childQuantity: 0,
      adultPriceClp: 36_000,
      bookingDate: "2026-08-28",
    });

    expect(line).toMatchObject({
      service: "biopiscinas",
      serviceId: 1,
      originalAmount: 144_000,
      unitAmounts: [36_000, 36_000, 36_000, 36_000],
    });
    expect(
      calculateWellnessDiscountAmounts([line], [true], "nth_free", 2)
    ).toMatchObject({
      discountTotal: 72_000,
      finalTotal: 72_000,
    });
  });

  it("conserva la fecha de visita y regala la entrada elegible más barata", () => {
    const line = buildBiopoolDiscountLine({
      serviceId: 1,
      adultQuantity: 2,
      childQuantity: 1,
      adultPriceClp: 36_000,
      childPriceClp: 24_000,
      bookingDate: "2026-08-21",
    });

    expect(line.bookingDate).toBe("2026-08-21");
    expect(weekdayOfBookingDate(line.bookingDate!)).toBe(5);
    expect(
      calculateWellnessDiscountAmounts([line], [true], "nth_free", 2)
    ).toMatchObject({
      originalTotal: 96_000,
      discountTotal: 24_000,
      finalTotal: 72_000,
    });
  });

  it("usa el constructor común en los cinco recálculos del router", () => {
    const router = readFileSync(
      new URL("./biopoolsRouter.ts", import.meta.url),
      "utf8"
    );

    expect(router.match(/buildBiopoolDiscountLine\(\{/g)).toHaveLength(5);
  });
});
