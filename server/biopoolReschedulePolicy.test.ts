import { describe, expect, it } from "vitest";
import {
  evaluateReschedulePolicy,
  validOverrideReason,
} from "./biopoolReschedulePolicy";

describe("Biopiscinas reschedule policy", () => {
  it("keeps policy violations blocking unless an exception is requested", () => {
    expect(
      evaluateReschedulePolicy({
        rescheduleCount: 2,
        maxReschedules: 2,
        hoursUntilStart: 4,
        noticeHours: 48,
        overrideRequested: false,
      })
    ).toEqual({
      exceedsMaximum: true,
      violatesNotice: true,
      canOverride: false,
    });
  });

  it("allows a deliberate exception while preserving the violations for audit", () => {
    expect(
      evaluateReschedulePolicy({
        rescheduleCount: 2,
        maxReschedules: 2,
        hoursUntilStart: 4,
        noticeHours: 48,
        overrideRequested: true,
      })
    ).toEqual({
      exceedsMaximum: true,
      violatesNotice: true,
      canOverride: true,
    });
  });

  it("does not record an exception when the normal policy is already satisfied", () => {
    expect(
      evaluateReschedulePolicy({
        rescheduleCount: 0,
        maxReschedules: 2,
        hoursUntilStart: 72,
        noticeHours: 48,
        overrideRequested: true,
      })
    ).toEqual({
      exceedsMaximum: false,
      violatesNotice: false,
      canOverride: false,
    });
  });

  it("requires a meaningful reason for an exception", () => {
    expect(validOverrideReason("Cliente")).toBe(false);
    expect(validOverrideReason("Autorizado por Operaciones")).toBe(true);
  });
});
