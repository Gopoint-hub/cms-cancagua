import { describe, expect, it } from "vitest";
import { getGiftCardMessage, shouldRenderGiftCardAmount } from "./giftcardPdfGenerator";

describe("gift card PDF amount", () => {
  it("hides the monetary amount for complimentary zero-value gift cards", () => {
    expect(shouldRenderGiftCardAmount(0)).toBe(false);
  });

  it("keeps showing the amount for regular paid gift cards", () => {
    expect(shouldRenderGiftCardAmount(50000)).toBe(true);
  });
});

describe("gift card PDF message", () => {
  it("keeps the complete service and thank-you message", () => {
    const message = "Servicio: Biopiscinas para 3 adultos y 2 niños. Gracias por tu comprensión. Como un pequeño gesto de agradecimiento, queremos regalarte esta Gift Card. ¡Te esperamos pronto! ✨";
    expect(getGiftCardMessage(message)).toBe(message);
  });
});
