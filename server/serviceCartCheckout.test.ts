import { describe, expect, it } from "vitest";
import { validateServiceCartPayment } from "./serviceCartCheckout";

const order = { webpayToken: "token-123", buyOrder: "CART-42", sessionId: "session-42", totalClp: 61_000 };
const approved = { buyOrder: "CART-42", sessionId: "session-42", amount: 61_000, responseCode: 0, status: "AUTHORIZED" };

describe("validateServiceCartPayment", () => {
  it("acepta una respuesta aprobada que corresponde exactamente al carrito", () => {
    expect(validateServiceCartPayment(order, approved, "token-123")).toEqual({ approved: true });
  });

  it.each([
    ["token distinto", { token: "otro", result: approved }, "Token Webpay no corresponde"],
    ["monto distinto", { token: "token-123", result: { ...approved, amount: 60_000 } }, "Monto Webpay no corresponde"],
    ["sesión distinta", { token: "token-123", result: { ...approved, sessionId: "otra" } }, "Sesión Webpay no corresponde"],
    ["pago rechazado", { token: "token-123", result: { ...approved, responseCode: -1, status: "FAILED" } }, "Pago rechazado por Webpay"],
  ])("rechaza %s", (_label, input, reason) => {
    expect(validateServiceCartPayment(order, input.result, input.token)).toEqual({ approved: false, reason });
  });
});
