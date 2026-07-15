import { describe, expect, it } from "vitest";
import {
  buildPublicMassageBookingNotifications,
  getChileDateString,
  normalizeDecimalInput,
  selectAutomaticMassageAssignment,
  serializePublicMassageTechnique,
  serializeDateOnly,
} from "./masajesRouter";

describe("getChileDateString", () => {
  it("uses the calendar date in Chile for automatic pending cleanup", () => {
    expect(getChileDateString(new Date("2026-07-15T02:30:00.000Z"))).toBe("2026-07-14");
    expect(getChileDateString(new Date("2026-07-15T15:00:00.000Z"))).toBe("2026-07-15");
  });
});

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

describe("serializePublicMassageTechnique", () => {
  it("exposes landing-ready technique data with duration prices and booking URL", () => {
    const technique = serializePublicMassageTechnique({
      id: 7,
      name: "Masaje Relajante",
      description: "Descanso profundo",
      imageUrl: "https://example.com/masaje.jpg",
      durations: "50,80",
      price50min: "45000",
      price80min: "81000",
      price110min: null,
      active: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(technique.imageUrl).toBe("https://example.com/masaje.jpg");
    expect(technique.prices).toEqual([
      { duration: 50, price: 45000 },
      { duration: 80, price: 81000 },
    ]);
    expect(technique.bookingUrl).toContain("/reservar/masaje/7");
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

describe("buildPublicMassageBookingNotifications", () => {
  it("builds client, internal, therapist, and WhatsApp notifications for a public booking", () => {
    const notifications = buildPublicMassageBookingNotifications({
      contactEmail: "contacto@cancagua.cl",
      clientName: "Maria Gonzalez",
      clientEmail: "maria@example.com",
      clientPhone: "+56 9 1234 5678",
      techniqueName: "Masaje relajacion",
      therapistName: "Terapeuta Uno",
      therapistEmail: "terapeuta@example.com",
      bookingDate: "2026-06-06",
      startTime: "12:00",
      endTime: "12:50",
      duration: 50,
      notes: "Sin preferencia",
    });

    expect(notifications.clientEmail?.to).toBe("maria@example.com");
    expect(notifications.internalEmail.to).toBe("contacto@cancagua.cl");
    expect(notifications.therapistEmail?.to).toBe("terapeuta@example.com");
    expect(notifications.clientWhatsApp?.phone).toBe("+56 9 1234 5678");
    expect(notifications.internalEmail.clientPhone).toBe("+56 9 1234 5678");
  });
});
