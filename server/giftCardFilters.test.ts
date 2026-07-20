import { describe, expect, it } from "vitest";
import { matchesGiftCardFilter } from "../shared/giftCardFilters";

const card = (overrides: Record<string, unknown> = {}) => ({
  purchaseStatus: "completed",
  status: "active",
  amount: 100000,
  balance: 100000,
  ...overrides,
});

describe("matchesGiftCardFilter", () => {
  it("classifies as purchased only completed cards with their full balance", () => {
    expect(matchesGiftCardFilter(card(), "completed")).toBe(true);
    expect(matchesGiftCardFilter(card({ balance: 40000 }), "completed")).toBe(false);
  });

  it("classifies as pending purchased cards that were partially redeemed", () => {
    expect(matchesGiftCardFilter(card({ balance: 40000 }), "pending")).toBe(true);
    expect(matchesGiftCardFilter(card({ balance: 100000 }), "pending")).toBe(false);
    expect(matchesGiftCardFilter(card({ balance: 0, status: "redeemed" }), "pending")).toBe(false);
    expect(matchesGiftCardFilter(card({ purchaseStatus: "failed", balance: 40000 }), "pending")).toBe(false);
  });

  it("classifies as failed every card that was not purchased", () => {
    expect(matchesGiftCardFilter(card({ purchaseStatus: "failed" }), "failed")).toBe(true);
    expect(matchesGiftCardFilter(card({ purchaseStatus: "pending" }), "failed")).toBe(true);
    expect(matchesGiftCardFilter(card({ purchaseStatus: "abandoned" }), "failed")).toBe(true);
    expect(matchesGiftCardFilter(card(), "failed")).toBe(false);
  });

  it("classifies fully redeemed cards as used", () => {
    expect(matchesGiftCardFilter(card({ status: "redeemed", balance: 0 }), "used")).toBe(true);
    expect(matchesGiftCardFilter(card({ amount: 0, balance: 0, status: "active" }), "used")).toBe(false);
  });

  it("shows every card in the all filter", () => {
    expect(matchesGiftCardFilter(card({ purchaseStatus: "failed" }), "all")).toBe(true);
  });
});
