import { describe, expect, it } from "vitest";
import { buildGiftCardEmailPresentation } from "./giftCardEmailContent";

describe("contenido del correo de Gift Cards", () => {
  it("presenta una Gift Card de Biopiscinas como servicio y separa la cantidad de personas", () => {
    const result = buildGiftCardEmailPresentation({
      amount: 0,
      message: "Servicio: Biopiscinas para 3 adultos y 2 niños. Gracias por tu comprensión.",
    });

    expect(result.kind).toBe("service");
    expect(result.headline).toBe("Biopiscinas");
    expect(result.serviceDetail).toBe("Para 3 adultos y 2 niños.");
    expect(result.personalMessage).toBe("Gracias por tu comprensión.");
    expect(result.subject).toBe("🎁 ¡Has recibido una Gift Card de Cancagua para Biopiscinas!");
    expect(result.subject).not.toContain("$0");
    expect(result.headline).not.toContain("$0");
    expect(result.introSuffix).toBe("para disfrutar de:");
  });

  it.each([
    ["Servicio: Masaje mixto para 1 persona.", "Masajes"],
    ["Servicio: Sauna Nativo para 2 personas.", "Sauna"],
    ["Servicio: Hot Tub para 4 personas.", "Hot-tub"],
  ])("normaliza el servicio %s como %s", (message, expected) => {
    expect(buildGiftCardEmailPresentation({ amount: 0, message }).headline).toBe(expected);
  });

  it("reconoce el servicio y cantidad en mensajes estructurados antiguos", () => {
    const result = buildGiftCardEmailPresentation({
      amount: 0,
      message: "Creada manualmente para recepción.\nDestinataria: Fundación Kalen.\nServicio: 2 entradas Biopiscinas.\nVálida hasta agosto.",
    });

    expect(result.headline).toBe("Biopiscinas");
    expect(result.serviceDetail).toBe("Para 2 personas.");
    expect(result.subject).toBe("🎁 ¡Has recibido una Gift Card de Cancagua para Biopiscinas!");
  });

  it("mantiene la presentación monetaria para Gift Cards con monto", () => {
    const result = buildGiftCardEmailPresentation({ amount: 50000, message: "Feliz cumpleaños" });

    expect(result.kind).toBe("amount");
    expect(result.headline).toBe("$50.000");
    expect(result.serviceDetail).toBeNull();
    expect(result.personalMessage).toBe("Feliz cumpleaños");
    expect(result.subject).toBe("🎁 ¡Has recibido una Gift Card de Cancagua por $50.000!");
    expect(result.introSuffix).toBe("por un valor de:");
  });
});
