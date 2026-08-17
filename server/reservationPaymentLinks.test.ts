import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { assertReservationPaymentEditable } from "./reservationPayments";
import { paymentLinkProviderFor, validatePaymentLinkApproval } from "./reservationPaymentLinks";

describe("links de pago de reservas", () => {
  it("agrupa Masajes y programas en Getnet; Bio y Sauna en Webpay", () => {
    expect(paymentLinkProviderFor("massages")).toBe("getnet");
    expect(paymentLinkProviderFor("massage_programs")).toBe("getnet");
    expect(paymentLinkProviderFor("biopools")).toBe("webpay");
    expect(paymentLinkProviderFor("sauna")).toBe("webpay");
  });

  it("solo acepta monto, moneda y referencia exactos", () => {
    const expected = {
      amountClp: 36_000,
      currency: "CLP",
      providerReference: "RPL-123",
      expectedAmountClp: 36_000,
      expectedReference: "RPL-123",
    };
    expect(validatePaymentLinkApproval(expected)).toBeNull();
    expect(validatePaymentLinkApproval({ ...expected, amountClp: 35_999 })).toMatch(/monto distinto/);
    expect(validatePaymentLinkApproval({ ...expected, amountClp: undefined })).toMatch(/monto CLP válido/);
    expect(validatePaymentLinkApproval({ ...expected, currency: "USD" })).toMatch(/moneda/);
    expect(validatePaymentLinkApproval({ ...expected, providerReference: "otra" })).toMatch(/referencia/);
  });

  it("protege pagos electrónicos acreditados y mantiene editables los manuales", () => {
    for (const method of ["getnet", "webpay", "webpay_plus"]) {
      expect(() => assertReservationPaymentEditable({ method })).toThrow(TRPCError);
    }
    for (const method of ["cash", "bank_transfer", "gift_card", "transbank_machine"]) {
      expect(() => assertReservationPaymentEditable({ method })).not.toThrow();
    }
  });
});
