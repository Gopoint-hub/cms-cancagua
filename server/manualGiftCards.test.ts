import { describe, expect, it } from "vitest";
import { buildManualGiftCardData } from "./manualGiftCards";

const actor = { id: 7, name: "Cony", email: "cony@example.com" };

describe("buildManualGiftCardData", () => {
  it("creates an amount-based gift card without payment or automatic delivery", () => {
    const result = buildManualGiftCardData({
      type: "amount",
      amount: 50000,
      backgroundImage: "https://example.com/gift.jpg",
      recipientName: "Cliente",
      recipientEmail: "cliente@example.com",
      personalMessage: "Un regalo",
    }, actor);

    expect(result.amount).toBe(50000);
    expect(result.balance).toBe(50000);
    expect(result.paymentMethod).toBeNull();
    expect(result.paymentReference).toBeNull();
    expect(result.deliveredAt).toBeNull();
    expect(result.purchaseStatus).toBe("completed");
  });

  it("creates a service gift card with zero balance and service details in the message", () => {
    const result = buildManualGiftCardData({
      type: "service",
      serviceName: "Biopiscinas",
      serviceDetails: "3 adultos y 2 niños",
      backgroundImage: "https://example.com/gift.jpg",
      recipientName: "Cliente",
      personalMessage: "Gracias por tu comprensión.",
    }, actor);

    expect(result.amount).toBe(0);
    expect(result.balance).toBe(0);
    expect(result.personalMessage).toBe("Servicio: Biopiscinas para 3 adultos y 2 niños. Gracias por tu comprensión.");
    expect(result.deliveredAt).toBeNull();
  });

  it("rejects amount gift cards without a positive amount", () => {
    expect(() => buildManualGiftCardData({
      type: "amount",
      amount: 0,
      backgroundImage: "default",
      recipientName: "Cliente",
    }, actor)).toThrow("monto");
  });

  it("rejects service gift cards without a service name", () => {
    expect(() => buildManualGiftCardData({
      type: "service",
      backgroundImage: "default",
      recipientName: "Cliente",
    }, actor)).toThrow("servicio");
  });
});
