import { describe, expect, it } from "vitest";
import {
  buildEntrySlots,
  calculateRefundQuote,
  minimumAvailableSeats,
  validateAdultChildQuantities,
} from "../shared/biopoolsCapacity";

describe("Biopiscinas capacity", () => {
  it("builds hourly entry slots and shortens the 18:00 stay", () => {
    const slots = buildEntrySlots({
      firstEntryTime: "10:00",
      lastEntryTime: "18:00",
      slotIntervalMinutes: 60,
      standardDurationMinutes: 240,
      finalEntryDurationMinutes: 210,
    });
    expect(slots).toHaveLength(9);
    expect(slots[0]).toEqual({
      startTime: "10:00",
      endTime: "14:00",
      durationMinutes: 240,
    });
    expect(slots.at(-1)).toEqual({
      startTime: "18:00",
      endTime: "21:30",
      durationMinutes: 210,
    });
  });

  it("counts rolling simultaneous occupancy and frees seats at checkout", () => {
    const occupancy = [
      { startTime: "10:00", endTime: "14:00", seats: 25 },
      { startTime: "11:00", endTime: "15:00", seats: 10 },
      { startTime: "14:00", endTime: "18:00", seats: 12 },
    ];
    expect(
      minimumAvailableSeats(
        40,
        { startTime: "12:00", endTime: "16:00" },
        occupancy
      )
    ).toBe(5);
    expect(
      minimumAvailableSeats(
        40,
        { startTime: "15:00", endTime: "19:00" },
        occupancy
      )
    ).toBe(28);
  });

  it("requires an adult whenever children are included", () => {
    expect(validateAdultChildQuantities(0, 1)).toMatch(/acompañado/);
    expect(validateAdultChildQuantities(1, 3)).toBeNull();
  });

  it("deducts the configured 0.25% transaction fee from eligible refunds", () => {
    expect(
      calculateRefundQuote({
        amountPaidClp: 60_000,
        feePercent: 0.25,
        hoursBeforeStart: 80,
        minimumNoticeHours: 72,
        paymentIsPaid: true,
      })
    ).toEqual({
      eligible: true,
      grossClp: 60_000,
      feeClp: 150,
      netClp: 59_850,
    });

    expect(
      calculateRefundQuote({
        amountPaidClp: 60_000,
        feePercent: 0.25,
        hoursBeforeStart: 48,
        minimumNoticeHours: 72,
        paymentIsPaid: true,
      }).eligible
    ).toBe(false);
  });
});
