import { describe, expect, it } from "vitest";
import { validatePublicGiftCard } from "./publicGiftCards";

const active = {
  code: "GC-TEST",
  amount: 50000,
  balance: 50000,
  redemptionMode: "amount",
  serviceKey: null,
  personalMessage: null,
  status: "active",
  purchaseStatus: "completed",
  expiresAt: new Date(Date.now() + 86_400_000),
} as any;

describe("Gift Cards en reservas web", () => {
  it("conserva el saldo sobrante de una Gift Card de monto", () => {
    expect(validatePublicGiftCard(active, "biopools", 32000)).toMatchObject({
      mode: "amount",
      appliedClp: 32000,
      balanceAfter: 18000,
    });
  });

  it("rechaza una Gift Card sin saldo suficiente", () => {
    expect(() => validatePublicGiftCard(active, "sauna", 60000)).toThrow(
      "saldo disponible"
    );
  });

  it("impide usar una Gift Card de servicio en otro módulo", () => {
    const serviceCard = {
      ...active,
      amount: 0,
      balance: 0,
      redemptionMode: "service",
      serviceKey: "massages",
    };
    expect(() =>
      validatePublicGiftCard(serviceCard, "biopools", 30000)
    ).toThrow("no corresponde al servicio");
  });
});
