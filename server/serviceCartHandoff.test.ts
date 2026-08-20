import { describe, expect, it } from "vitest";
import {
  createCustomerCheckoutHandoff,
  resolveCustomerCheckoutHandoff,
} from "./serviceCartHandoff";

const profile = {
  clientName: "María González",
  clientEmail: "maria@example.com",
  clientPhone: "+56912345678",
  acquisition: {
    discoverySource: "friends_family" as const,
    originType: "chile" as const,
    country: "Chile",
    region: "Región de Los Lagos",
    city: "Frutillar",
  },
};

describe("customer checkout handoff", () => {
  it("transfiere el perfil completo sin exponerlo como texto en la URL", () => {
    const token = createCustomerCheckoutHandoff(profile, { secret: "test-secret", now: 1_000, ttlMs: 30_000 });
    expect(token).not.toContain(profile.clientEmail);
    expect(resolveCustomerCheckoutHandoff(token, { secret: "test-secret", now: 2_000 })).toEqual(profile);
  });

  it("rechaza tokens alterados", () => {
    const token = createCustomerCheckoutHandoff(profile, { secret: "test-secret" });
    expect(() => resolveCustomerCheckoutHandoff(`${token.slice(0, -1)}x`, { secret: "test-secret" })).toThrow(/no es válido/);
  });

  it("rechaza tokens vencidos", () => {
    const token = createCustomerCheckoutHandoff(profile, { secret: "test-secret", now: 1_000, ttlMs: 100 });
    expect(() => resolveCustomerCheckoutHandoff(token, { secret: "test-secret", now: 1_101 })).toThrow(/venció/);
  });
});
