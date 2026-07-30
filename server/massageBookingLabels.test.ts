import { describe, expect, it } from "vitest";
import { getMassageBookingStatusLabel, getMassagePaymentStatusLabel } from "@shared/massageBookingLabels";

describe("etiquetas de estado en la agenda de masajes", () => {
  it("distingue una asignación pendiente de un pago pendiente", () => {
    expect(getMassageBookingStatusLabel("pending")).toBe("Asignación pendiente");
    expect(getMassagePaymentStatusLabel("pending")).toBe("Pago pendiente");
  });

  it("muestra claramente el pago actualizado", () => {
    expect(getMassagePaymentStatusLabel("paid")).toBe("Pagado");
  });
});
