import { describe, expect, it } from "vitest";
import { normalizeDecimalInput, selectAutomaticMassageAssignment, serializeDateOnly } from "./masajesRouter";

describe("serializeDateOnly", () => {
  it("serializes Date values as YYYY-MM-DD strings for React-safe rendering", () => {
    expect(serializeDateOnly(new Date(2026, 4, 28))).toBe("2026-05-28");
  });

  it("preserves existing date strings and null values", () => {
    expect(serializeDateOnly("2026-05-28T12:30:00.000Z")).toBe("2026-05-28");
    expect(serializeDateOnly(null)).toBeNull();
  });
});

describe("normalizeDecimalInput", () => {
  it("accepts comma decimals and strips unit labels before saving", () => {
    expect(normalizeDecimalInput("0,2 ml")).toBe("0.2");
    expect(normalizeDecimalInput("2 ml")).toBe("2");
  });

  it("rejects values that do not contain a valid number", () => {
    expect(() => normalizeDecimalInput("ml")).toThrow("Ingresa una cantidad valida");
  });
});

describe("selectAutomaticMassageAssignment", () => {
  const rooms = [{ id: 10 }];

  it("prioritizes an available inhouse therapist over freelance therapists", () => {
    const assignment = selectAutomaticMassageAssignment({
      therapists: [
        { id: 2, name: "Freelance Alta", type: "freelance", callPriority: 1, scheduleStart: "10:00", scheduleEnd: "18:00" },
        { id: 1, name: "Inhouse", type: "inhouse", callPriority: 99, scheduleStart: "10:00", scheduleEnd: "18:00" },
      ],
      bookings: [],
      rooms,
      startTime: "12:00",
      duration: 50,
    });

    expect(assignment?.therapist.id).toBe(1);
    expect(assignment?.room.id).toBe(10);
  });

  it("falls back to freelance priority order when inhouse therapists are busy", () => {
    const assignment = selectAutomaticMassageAssignment({
      therapists: [
        { id: 1, name: "Inhouse", type: "inhouse", callPriority: 99, scheduleStart: "10:00", scheduleEnd: "18:00" },
        { id: 2, name: "Freelance Baja", type: "freelance", callPriority: 5, scheduleStart: "10:00", scheduleEnd: "18:00" },
        { id: 3, name: "Freelance Alta", type: "freelance", callPriority: 1, scheduleStart: "10:00", scheduleEnd: "18:00" },
      ],
      bookings: [
        { therapistId: 1, roomId: 20, startTime: "11:30", endTime: "13:00" },
      ],
      rooms: [{ id: 20 }, { id: 21 }],
      startTime: "12:00",
      duration: 50,
    });

    expect(assignment?.therapist.id).toBe(3);
  });

  it("ignores therapists whose schedule does not cover the full requested service", () => {
    const assignment = selectAutomaticMassageAssignment({
      therapists: [
        { id: 1, name: "Inhouse Corto", type: "inhouse", callPriority: 1, scheduleStart: "10:00", scheduleEnd: "12:30" },
        { id: 2, name: "Freelance Disponible", type: "freelance", callPriority: 1, scheduleStart: "10:00", scheduleEnd: "14:00" },
      ],
      bookings: [],
      rooms,
      startTime: "12:00",
      duration: 80,
    });

    expect(assignment?.therapist.id).toBe(2);
  });
});
