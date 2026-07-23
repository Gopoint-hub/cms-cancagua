import { describe, expect, it } from "vitest";
import { buildMassageTherapistWhatsAppMessage } from "./massageTherapistInvitations";

describe("massage therapist invitation", () => {
  it("includes the read-only scope and activation link in WhatsApp", () => {
    const message = buildMassageTherapistWhatsAppMessage("Ana Pérez", "ana@example.com", "token-seguro");

    expect(message).toContain("Hola Ana");
    expect(message).toContain("solo lectura");
    expect(message).toContain("Tu usuario es: ana@example.com");
    expect(message).toContain("/cms/activar-cuenta?token=token-seguro");
    expect(message).toContain("vence en 7 días");
  });
});
