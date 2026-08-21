import type { WellnessDiscountLine } from "./massageDiscounts";

export type BiopoolDiscountLineInput = {
  serviceId: number;
  adultQuantity: number;
  childQuantity: number;
  adultPriceClp: number;
  childPriceClp?: number | null;
  bookingDate: string | undefined;
  originalAmountClp?: number;
};

/**
 * Construye la misma línea de descuento para todos los flujos de Biopiscinas.
 * Los códigos nth_free (por ejemplo, 2x1) necesitan una unidad por entrada;
 * con solo el subtotal el motor interpreta que existe una única unidad.
 */
export function buildBiopoolDiscountLine(
  input: BiopoolDiscountLineInput
): WellnessDiscountLine {
  const unitAmounts = [
    ...Array.from({ length: input.adultQuantity }, () => input.adultPriceClp),
    ...Array.from(
      { length: input.childQuantity },
      () => input.childPriceClp ?? 0
    ),
  ];
  return {
    service: "biopiscinas",
    serviceId: input.serviceId,
    originalAmount:
      input.originalAmountClp ??
      unitAmounts.reduce((sum, amountClp) => sum + amountClp, 0),
    unitAmounts,
    bookingDate: input.bookingDate,
  };
}
