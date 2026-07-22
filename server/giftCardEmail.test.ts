import { describe, expect, it } from "vitest";
import { buildGiftCardContactHtml, GIFT_CARD_CONTACT_EMAIL } from "./_core/email";

describe("correo de contacto de Gift Cards", () => {
  it("usa contacto@cancagua.cl en el texto y enlace de contacto", () => {
    expect(GIFT_CARD_CONTACT_EMAIL).toBe("contacto@cancagua.cl");
    const html = buildGiftCardContactHtml();
    expect(html).toContain('mailto:contacto@cancagua.cl');
    expect(html).toContain('>contacto@cancagua.cl</a>');
    expect(html).not.toContain('eventos@cancagua.cl');
  });
});
