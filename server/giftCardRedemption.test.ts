import { describe, expect, it } from "vitest";
import { canRedeemGiftCard, validateGiftCardRedemption } from "./giftCardRedemption";

describe("permisos de canje de Gift Cards", () => {
  it("permite canjear al personal Cancagua que tiene acceso al módulo de ventas", () => {
    expect(canRedeemGiftCard("cancagua_staff")).toBe(true);
  });

  it("mantiene el canje para administración y edición", () => {
    expect(canRedeemGiftCard("super_admin")).toBe(true);
    expect(canRedeemGiftCard("admin")).toBe(true);
    expect(canRedeemGiftCard("editor")).toBe(true);
  });

  it("no permite canjear a roles sin acceso operativo", () => {
    expect(canRedeemGiftCard("massage_therapist")).toBe(false);
    expect(canRedeemGiftCard("user")).toBe(false);
  });
});

describe("validación de canje de Gift Cards", () => {
  it("acepta canjear el saldo completo de una tarjeta activa y comprada", () => {
    expect(() => validateGiftCardRedemption({
      status: "active",
      purchaseStatus: "completed",
      balance: 50000,
      amount: 50000,
      expiresAt: new Date(Date.now() + 86400000),
    })).not.toThrow();
  });

  it("explica por qué no puede canjearse en vez de fallar silenciosamente", () => {
    expect(() => validateGiftCardRedemption({
      status: "active",
      purchaseStatus: "completed",
      balance: 10000,
      amount: 20000,
      expiresAt: null,
    })).toThrow("El monto supera el saldo disponible");
  });
});
