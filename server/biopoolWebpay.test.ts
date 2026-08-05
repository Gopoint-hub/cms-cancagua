import { describe, expect, it } from "vitest";
import { validateBiopoolPayment } from "./biopoolWebpay";

const order = {
  buyOrder: "BIO-42-abc123",
  sessionId: "SES-abc",
  totalClp: 60_000,
  webpayToken: "token-ok",
};

const approved = {
  buyOrder: "BIO-42-abc123",
  sessionId: "SES-abc",
  amount: 60_000,
  responseCode: 0,
  status: "AUTHORIZED",
};

describe("validateBiopoolPayment", () => {
  it("aprueba solo cuando token, orden, sesión, monto y estado coinciden", () => {
    expect(validateBiopoolPayment(order, approved, "token-ok")).toEqual({ approved: true });
  });

  it.each([
    [{ ...approved, amount: 36_000 }, "Monto"],
    [{ ...approved, buyOrder: "otra" }, "Orden"],
    [{ ...approved, sessionId: "otra" }, "Sesión"],
    [{ ...approved, responseCode: -1, status: "FAILED" }, "rechazado"],
  ])("rechaza resultados Webpay alterados", (result, reason) => {
    const validation = validateBiopoolPayment(order, result, "token-ok");
    expect(validation.approved).toBe(false);
    expect(validation.reason).toContain(reason);
  });

  it("rechaza un token distinto", () => {
    expect(validateBiopoolPayment(order, approved, "token-falso")).toMatchObject({ approved: false });
  });
});
