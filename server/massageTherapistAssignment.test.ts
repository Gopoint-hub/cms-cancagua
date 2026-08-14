import { describe, expect, it } from "vitest";
import {
  buildFreelanceAssignmentMessage,
  buildFreelanceExpirationMessage,
  buildInhouseAssignmentMessage,
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
    id: 2,
    name: "Tamara Muñoz",
    phone: "+56944444444",
    type: "inhouse" as const,
    callPriority: 30,
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
  it("expires each freelance response link exactly after the 60-minute window", () => {
    const sentAt = new Date("2026-07-29T15:00:00.000Z");
    const expiresAt = new Date(sentAt.getTime() + THERAPIST_RESPONSE_WINDOW_MS);
    expect(THERAPIST_RESPONSE_WINDOW_MS).toBe(60 * 60 * 1000);
    expect(isTherapistAssignmentExpired(expiresAt, new Date("2026-07-29T15:59:59.999Z"))).toBe(false);
    expect(isTherapistAssignmentExpired(expiresAt, new Date("2026-07-29T16:00:00.000Z"))).toBe(true);
  });

  it("moves immediately to the next available therapist after an attempted therapist", () => {
    const selected = selectNextTherapistCandidate({
      candidates: [candidates[3], ...candidates.slice(0, 3)],
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
      excludedTherapistIds: new Set([2, 8]),
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

  it("never lets a preselected freelance therapist jump over available inhouse staff", () => {
    const selected = selectNextTherapistCandidate({
      candidates: [candidates[3], ...candidates.slice(0, 3)],
      blockers: [],
      attemptedTherapistIds: new Set(),
      startTime: "12:00",
      endTime: "12:50",
    });
    expect(selected?.id).toBe(3);
  });

  it("uses Tamara before any freelance therapist when Barbara and Daniela are busy", () => {
    const selected = selectNextTherapistCandidate({
      candidates,
      blockers: [
        { therapistId: 3, startTime: "12:00", endTime: "12:50" },
        { therapistId: 1, startTime: "12:00", endTime: "12:50" },
      ],
      attemptedTherapistIds: new Set(),
      startTime: "12:00",
      endTime: "12:50",
    });
    expect(selected?.id).toBe(2);
  });

  it("can assign an inhouse therapist even if the notification phone is missing", () => {
    const selected = selectNextTherapistCandidate({
      candidates: [{ ...candidates[0], phone: null }],
      blockers: [],
      attemptedTherapistIds: new Set(),
      startTime: "12:00",
      endTime: "12:50",
    });
    expect(selected?.id).toBe(3);
  });

  it("uses informational copy for inhouse and 60-minute confirmation copy for freelance", () => {
    const base = {
      therapistName: "Bárbara Frías",
      clientName: "Cliente",
      serviceName: "Masaje relajante",
      duration: 50,
      bookingDate: "2026-08-20",
      startTime: "12:00",
      endTime: "12:50",
    };
    const inhouse = buildInhouseAssignmentMessage(base);
    const freelance = buildFreelanceAssignmentMessage({ ...base, actionUrl: "https://example.com/token" });
    const expired = buildFreelanceExpirationMessage(base);

    expect(inhouse).toContain("No necesitas confirmarlo");
    expect(inhouse).not.toContain("Responde aquí");
    expect(freelance).toContain("60 minutos");
    expect(freelance).toContain("Responde aquí");
    expect(expired).toContain("Expiró tu tiempo de confirmación");
    expect(expired).toContain("Estamos asignando a otro terapeuta");
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
