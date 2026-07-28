import { describe, expect, it } from "vitest";
import {
  calendarMonthRange,
  nextCalendarMonth,
} from "./regularClassesPeriod";

describe("calendar month periods", () => {
  it("uses the first and last day of a 31-day month", () => {
    expect(calendarMonthRange("2026-07")).toEqual({
      start: "2026-07-01",
      end: "2026-07-31",
    });
  });

  it("handles February and leap years", () => {
    expect(calendarMonthRange("2027-02").end).toBe("2027-02-28");
    expect(calendarMonthRange("2028-02").end).toBe("2028-02-29");
  });

  it("moves a postponed membership to the next calendar month", () => {
    expect(nextCalendarMonth("2026-12-01")).toBe("2027-01");
  });

  it("rejects invalid months", () => {
    expect(() => calendarMonthRange("2026-13")).toThrow("Mes inválido");
  });
});
