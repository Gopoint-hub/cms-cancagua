import { describe, expect, it } from "vitest";
import {
  availableSaunaSeats,
  buildSaunaSlots,
  capacityUsedBySaunaBooking,
  hasSaunaBookingLeadTime,
  inferSaunaBooking,
  validateSaunaParty,
} from "../shared/sauna";

describe("sauna capacity", () => {
  it("shares the six physical seats between unrelated bookings", () => {
    expect(availableSaunaSeats([{ guests: 1 }, { guests: 2 }])).toBe(3);
    expect(
      availableSaunaSeats([{ guests: 1 }, { guests: 2 }, { guests: 3 }])
    ).toBe(0);
  });

  it("private, four-person and five-person tickets consume all six seats", () => {
    expect(capacityUsedBySaunaBooking({ guests: 2, isPrivate: true })).toBe(6);
    expect(capacityUsedBySaunaBooking({ guests: 4 })).toBe(6);
    expect(capacityUsedBySaunaBooking({ guests: 5 })).toBe(6);
    expect(availableSaunaSeats([{ guests: 2, isPrivate: true }])).toBe(0);
  });

  it("does not count cancelled bookings", () => {
    expect(
      availableSaunaSeats([{ guests: 6, isPrivate: true, status: "cancelled" }])
    ).toBe(6);
  });

  it("requires bookings of four to six people to block the full sauna", () => {
    expect(validateSaunaParty(3, false)).toBeNull();
    expect(validateSaunaParty(4, false)).toContain("completo");
    expect(validateSaunaParty(5, false)).toContain("completo");
    expect(validateSaunaParty(6, false)).toContain("completo");
    expect(validateSaunaParty(6, true)).toBeNull();
  });

  it("infers Skedu services and Detox party sizes", () => {
    expect(inferSaunaBooking("Sauna Nativo 3 Personas")).toMatchObject({
      guests: 3,
      capacityUsed: 3,
      kind: "shared",
    });
    expect(inferSaunaBooking("Sauna Nativo 4 Personas")).toMatchObject({
      guests: 4,
      capacityUsed: 6,
      kind: "private",
    });
    expect(inferSaunaBooking("Sauna Nativo 5 Personas")).toMatchObject({
      guests: 5,
      capacityUsed: 6,
      kind: "private",
    });
    expect(
      inferSaunaBooking("Sauna Nativo Privado (Hasta 6 personas)")
    ).toMatchObject({ guests: 6, capacityUsed: 6, kind: "private" });
    expect(
      inferSaunaBooking("Pase Reconecta Detox", "Programa para 4 personas")
    ).toMatchObject({ guests: 4, capacityUsed: 4, kind: "detox" });
  });

  it("builds 30-minute starts and checks capacity across 60-minute overlaps", () => {
    expect(buildSaunaSlots("10:00", "12:00")).toEqual([
      { startTime: "10:00", endTime: "11:00" },
      { startTime: "10:30", endTime: "11:30" },
      { startTime: "11:00", endTime: "12:00" },
    ]);
  });

  it("enforces the configured public booking lead time", () => {
    const now = new Date("2026-08-17T16:00:00.000Z");
    expect(
      hasSaunaBookingLeadTime(new Date("2026-08-17T17:59:59.999Z"), 2, now)
    ).toBe(false);
    expect(
      hasSaunaBookingLeadTime(new Date("2026-08-17T18:00:00.000Z"), 2, now)
    ).toBe(true);
  });
});
