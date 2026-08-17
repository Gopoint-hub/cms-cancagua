import { describe, expect, it } from "vitest";
import {
  reservationPaymentInputSchema,
  validateReservationPayment,
} from "./reservationPayments";

describe("pagos pendientes de reservas", () => {
  it("permite guardar el monto como pendiente sin fecha ni referencia", () => {
    const payment = reservationPaymentInputSchema.parse({
      method: "pending_payment",
      status: "pending",
      amountClp: 36_000,
    });
    expect(() => validateReservationPayment(payment)).not.toThrow();
  });

  it("obliga a elegir el medio real antes de marcar el pago como pagado", () => {
    const payment = reservationPaymentInputSchema.parse({
      method: "pending_payment",
      status: "paid",
      amountClp: 36_000,
      paidAt: "2026-08-17T10:30",
    });
    expect(() => validateReservationPayment(payment)).toThrow(
      "Selecciona el medio de pago real"
    );
  });
});
