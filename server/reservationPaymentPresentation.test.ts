import { describe, expect, it } from "vitest";
import { reservationPaymentCardState } from "../client/src/components/cms/Reservation360DetailDialog";

describe("presentación de cobertura en la tarjeta de pago 360", () => {
  it("distingue una reserva cubierta completamente por descuento", () => {
    expect(
      reservationPaymentCardState({
        amountClp: 0,
        balanceAmountClp: 0,
        discountAmountClp: 72_000,
        discountCode: "LIBERA100ALL",
      })
    ).toMatchObject({
      title: "Cubierta con descuento",
      paidAmountClp: 0,
      discountAmountClp: 72_000,
      discountCode: "LIBERA100ALL",
      hasDiscount: true,
      discountOnlySettled: true,
    });
  });

  it("mantiene separado el dinero pagado del descuento aplicado", () => {
    expect(
      reservationPaymentCardState({
        amountClp: 36_000,
        balanceAmountClp: 0,
        discountAmountClp: 36_000,
        discountCode: "BIOPISCINA2X1",
      })
    ).toMatchObject({
      title: "Pagada",
      paidAmountClp: 36_000,
      discountAmountClp: 36_000,
      hasDiscount: true,
      discountOnlySettled: false,
    });
  });

  it("conserva el estado pendiente cuando el descuento no cubre el saldo", () => {
    expect(
      reservationPaymentCardState({
        amountClp: 0,
        balanceAmountClp: 36_000,
        discountAmountClp: 36_000,
      })
    ).toMatchObject({
      title: "No pagada",
      paidAmountClp: 0,
      discountAmountClp: 36_000,
      hasDiscount: true,
      discountOnlySettled: false,
    });
  });
});
