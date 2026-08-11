import { describe, expect, it } from "vitest";
import { validateSaunaPayment } from "./saunaWebpay";

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
});
