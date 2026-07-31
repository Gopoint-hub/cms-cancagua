import { describe, expect, it } from "vitest";
import { calculateMassageDiscountAmounts, calculateWellnessDiscountAmounts } from "./massageDiscounts";

describe("calculateMassageDiscountAmounts", () => {
  const lines = [
    { techniqueId: 1, originalAmount: 80_000 },
    { techniqueId: 2, originalAmount: 40_000 },
  ];

  it("aplica porcentaje a todos y conserva la suma por línea", () => {
    const result = calculateMassageDiscountAmounts(lines, new Set(), "percentage", 20);
    expect(result.discountTotal).toBe(24_000);
    expect(result.finalTotal).toBe(96_000);
    expect(result.lineDiscounts.reduce((sum, amount) => sum + amount, 0)).toBe(24_000);
  });

  it("aplica el descuento sólo a técnicas seleccionadas", () => {
    const result = calculateMassageDiscountAmounts(lines, new Set([1]), "percentage", 25);
    expect(result.lineDiscounts).toEqual([20_000, 0]);
    expect(result.finalTotal).toBe(100_000);
  });

  it("limita un monto fijo al subtotal elegible sin producir negativos", () => {
    const result = calculateMassageDiscountAmounts(lines, new Set([2]), "fixed", 70_000);
    expect(result.discountTotal).toBe(40_000);
    expect(result.finalTotal).toBe(80_000);
  });
});

describe("calculateWellnessDiscountAmounts", () => {
  const mixedCart = [
    { originalAmount: 60_000 },
    { originalAmount: 45_000 },
  ];

  it("aplica un código de clases sólo al plan dentro de un carrito mixto", () => {
    const result = calculateWellnessDiscountAmounts(mixedCart, [false, true], "percentage", 20);
    expect(result.discountTotal).toBe(9_000);
    expect(result.lineDiscounts).toEqual([0, 9_000]);
    expect(result.finalTotal).toBe(96_000);
  });

  it("distribuye un código general entre el masaje y el plan", () => {
    const result = calculateWellnessDiscountAmounts(mixedCart, [true, true], "fixed", 21_000);
    expect(result.discountTotal).toBe(21_000);
    expect(result.lineDiscounts.reduce((sum, amount) => sum + amount, 0)).toBe(21_000);
    expect(result.finalTotal).toBe(84_000);
  });
});
