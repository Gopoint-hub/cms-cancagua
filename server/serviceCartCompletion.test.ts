import { describe, expect, it } from "vitest";
import { isFullyDiscountedServiceCart, type ServiceCartChildOrder } from "./serviceCartCompletion";

describe("carrito cubierto completamente por descuento", () => {
  it("acepta un carrito mixto de biopiscinas, sauna y masaje en $0", () => {
    const children: ServiceCartChildOrder[] = [
      { module: "biopools", id: 1, totalClp: 0, fullyDiscounted: true },
      { module: "sauna", id: 2, totalClp: 0, fullyDiscounted: true },
      { module: "massages", id: 3, totalClp: 0, fullyDiscounted: true },
    ];
    expect(isFullyDiscountedServiceCart(0, children)).toBe(true);
  });

  it("rechaza el cierre sin pasarela cuando queda una línea por pagar", () => {
    const children: ServiceCartChildOrder[] = [
      { module: "biopools", id: 1, totalClp: 0, fullyDiscounted: true },
      { module: "sauna", id: 2, totalClp: 25_000, fullyDiscounted: false },
    ];
    expect(isFullyDiscountedServiceCart(25_000, children)).toBe(false);
  });
});
