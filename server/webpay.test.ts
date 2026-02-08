import { describe, expect, it } from "vitest";

describe("WebPay credentials", () => {
  it("WEBPAY_API_KEY is set and has correct format (UUID)", () => {
    const key = process.env.WEBPAY_API_KEY;
    expect(key).toBeDefined();
    expect(key).not.toBe("");
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("WEBPAY_COMMERCE_CODE is set and is numeric", () => {
    const code = process.env.WEBPAY_COMMERCE_CODE;
    expect(code).toBeDefined();
    expect(code).not.toBe("");
    expect(code).toMatch(/^\d+$/);
  });

  it("WEBPAY_ENVIRONMENT is set to production or integration", () => {
    const env = process.env.WEBPAY_ENVIRONMENT;
    expect(env).toBeDefined();
    expect(["production", "integration"]).toContain(env);
  });
});
