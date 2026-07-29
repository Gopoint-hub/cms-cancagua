import { describe, expect, it } from "vitest";
import {
  isTherapistAssignmentExpired,
  selectNextTherapistCandidate,
  THERAPIST_RESPONSE_WINDOW_MS,
} from "./massageTherapistAssignment";
import {
  getMassagePaymentMethodLabel,
  MANUAL_MASSAGE_PAYMENT_METHODS,
} from "@shared/massagePayments";

const candidates = [
  {
    id: 3,
    name: "Bárbara Frías",
    phone: "+56911111111",
    type: "inhouse" as const,
    callPriority: 10,
    scheduleStart: "10:00",
    scheduleEnd: "18:00",
  },
  {
    id: 1,
    name: "Daniela Caerols",
    phone: "+56922222222",
    type: "inhouse" as const,
    callPriority: 20,
    scheduleStart: "10:00",
    scheduleEnd: "18:00",
  },
  {
    id: 8,
    name: "Terapeuta freelance",
    phone: "+56933333333",
    type: "freelance" as const,
    callPriority: 1,
    scheduleStart: "10:00",
    scheduleEnd: "20:00",
  },
];

describe("therapist assignment rotation", () => {
  it("expires each response link exactly after the 30-minute window", () => {
    const sentAt = new Date("2026-07-29T15:00:00.000Z");
    const expiresAt = new Date(sentAt.getTime() + THERAPIST_RESPONSE_WINDOW_MS);
    expect(THERAPIST_RESPONSE_WINDOW_MS).toBe(30 * 60 * 1000);
    expect(isTherapistAssignmentExpired(expiresAt, new Date("2026-07-29T15:29:59.999Z"))).toBe(false);
    expect(isTherapistAssignmentExpired(expiresAt, new Date("2026-07-29T15:30:00.000Z"))).toBe(true);
  });

  it("moves immediately to the next available therapist after an attempted therapist", () => {
    const selected = selectNextTherapistCandidate({
      candidates,
      blockers: [],
      attemptedTherapistIds: new Set([3]),
      startTime: "12:00",
      endTime: "12:50",
    });
    expect(selected?.id).toBe(1);
  });

  it("respects schedule, existing bookings and the other slot of a double massage", () => {
    const selected = selectNextTherapistCandidate({
      candidates,
      blockers: [{ therapistId: 1, startTime: "11:30", endTime: "13:00" }],
      attemptedTherapistIds: new Set([3]),
      excludedTherapistIds: new Set([8]),
      startTime: "12:00",
      endTime: "12:50",
    });
    expect(selected).toBeNull();
  });

  it("keeps the 10-minute preparation buffer before the next massage", () => {
    const selected = selectNextTherapistCandidate({
      candidates: [candidates[0]],
      blockers: [{ therapistId: 3, startTime: "12:55", endTime: "13:45" }],
      attemptedTherapistIds: new Set(),
      startTime: "12:00",
      endTime: "12:50",
    });
    expect(selected).toBeNull();
  });

  it("keeps the already selected therapist first when the offer starts", () => {
    const selected = selectNextTherapistCandidate({
      candidates,
      blockers: [],
      attemptedTherapistIds: new Set(),
      preferredTherapistId: 8,
      startTime: "12:00",
      endTime: "12:50",
    });
    expect(selected?.id).toBe(8);
  });
});

describe("manual massage payment methods", () => {
  it("includes every requested payment option with a readable label", () => {
    expect(MANUAL_MASSAGE_PAYMENT_METHODS).toEqual([
      "getnet_link",
      "getnet_pos",
      "bank_transfer",
      "cash",
      "gift_card",
      "transbank",
    ]);
    for (const method of MANUAL_MASSAGE_PAYMENT_METHODS) {
      expect(getMassagePaymentMethodLabel(method)).not.toBe(method);
    }
  });
});
