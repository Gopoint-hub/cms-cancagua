import { describe, expect, it } from "vitest";
import { canRedeemGiftCard, validateGiftCardRedemption, validateServiceGiftCardRedemption } from "./giftCardRedemption";

describe("permisos de canje de Gift Cards", () => {
  it("permite canjear al personal Cancagua que tiene acceso al módulo de ventas", () => {
    expect(canRedeemGiftCard({ role: "cancagua_staff" })).toBe(true);
  });

  it("mantiene el canje para administración y edición", () => {
    expect(canRedeemGiftCard({ role: "super_admin" })).toBe(true);
    expect(canRedeemGiftCard({ role: "admin" })).toBe(true);
    expect(canRedeemGiftCard({ role: "editor" })).toBe(true);
  });

  it("no permite canjear a roles sin acceso operativo", () => {
    expect(canRedeemGiftCard({ role: "massage_therapist" })).toBe(false);
    expect(canRedeemGiftCard({ role: "user", permissions: "[]" })).toBe(false);
  });

  it("permite canjear a recepción con el permiso exclusivo de Gift Cards", () => {
    expect(canRedeemGiftCard({
      role: "massage_therapist",
      permissions: JSON.stringify(["module.gift_cards"]),
    })).toBe(true);
  });
});

describe("validación de Gift Cards por servicio", () => {
  it("solo permite utilizar servicios cuya compra esté completada", () => {
    expect(() => validateServiceGiftCardRedemption({
      status: "active",
      purchaseStatus: "pending",
      amount: 0,
      expiresAt: null,
    })).toThrow("La Gift Card no tiene una compra completada");
  });

  it("acepta una Gift Card por servicio activa, completada y vigente", () => {
    expect(() => validateServiceGiftCardRedemption({
      status: "active",
      purchaseStatus: "completed",
      amount: 0,
      expiresAt: new Date(Date.now() + 86400000),
    })).not.toThrow();
  });

  it("acepta una Gift Card únicamente en su módulo asociado", () => {
    expect(() => validateServiceGiftCardRedemption({ status: "active", purchaseStatus: "completed", amount: 0, serviceKey: "sauna", requestedServiceKey: "sauna" })).not.toThrow();
    expect(() => validateServiceGiftCardRedemption({ status: "active", purchaseStatus: "completed", amount: 0, serviceKey: "sauna", requestedServiceKey: "massages" })).toThrow("no corresponde al servicio");
  });

  it("mantiene bloqueados los programas mixtos hasta que exista su módulo", () => {
    expect(() => validateServiceGiftCardRedemption({ status: "active", purchaseStatus: "completed", amount: 0, serviceKey: "mixed_program", requestedServiceKey: "sauna" })).toThrow("programa que todavía no está habilitado");
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
