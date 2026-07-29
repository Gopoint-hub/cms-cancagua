import { describe, expect, it } from "vitest";
import { calculatePaidMassageBookingRevenue } from "@shared/massageRevenue";

describe("massage dashboard revenue", () => {
  it("shows paid reservations even while therapist confirmation is pending", () => {
    expect(calculatePaidMassageBookingRevenue([
      { paymentStatus: "paid", status: "pending", amountPaid: "45000" },
      { paymentStatus: "paid", status: "confirmed", amountPaid: 35_000 },
    ])).toBe(80_000);
  });

  it("excludes pending payments, refunds and cancelled reservations", () => {
    expect(calculatePaidMassageBookingRevenue([
      { paymentStatus: "pending", status: "pending", amountPaid: 45_000 },
      { paymentStatus: "refunded", status: "completed", amountPaid: 50_000 },
      { paymentStatus: "paid", status: "cancelled", amountPaid: 35_000 },
    ])).toBe(0);
  });
});
