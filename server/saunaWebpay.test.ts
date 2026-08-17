import { describe, expect, it } from "vitest";
import { canFinalizeSaunaCheckout, validateSaunaPayment } from "./saunaWebpay";

const order = {
  webpayToken: "token",
  buyOrder: "SAU-1",
  sessionId: "session",
  totalClp: 40_000,
};
const result = {
  buyOrder: "SAU-1",
  sessionId: "session",
  amount: 40_000,
  responseCode: 0,
  status: "AUTHORIZED",
};

describe("validateSaunaPayment", () => {
  it("accepts a matching authorized payment", () => {
    expect(validateSaunaPayment(order, result, "token")).toEqual({
      approved: true,
    });
  });

  it("rejects amount and token tampering", () => {
    expect(
      validateSaunaPayment(order, { ...result, amount: 1 }, "token").approved
    ).toBe(false);
    expect(validateSaunaPayment(order, result, "another-token").approved).toBe(
      false
    );
  });

  it("allows a late return to finalize only before refund or manual review", () => {
    expect(canFinalizeSaunaCheckout("expired")).toBe(true);
    expect(canFinalizeSaunaCheckout("payment_pending")).toBe(true);
    expect(canFinalizeSaunaCheckout("aborted")).toBe(false);
    expect(canFinalizeSaunaCheckout("rejected")).toBe(false);
    expect(canFinalizeSaunaCheckout("refunded")).toBe(false);
    expect(canFinalizeSaunaCheckout("manual_review")).toBe(false);
  });
});
