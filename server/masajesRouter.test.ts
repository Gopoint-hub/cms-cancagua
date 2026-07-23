import { describe, expect, it } from "vitest";
import {
  buildInhouseMonthRotation,
  buildRecurringMassageAvailability,
  buildPublicMassageBookingNotifications,
  getChileDateString,
  getChileTimeString,
  getSkeduMassageQuantity,
  getSkeduMassageUnitPrice,
  getRecurringMassageAvailabilityHorizon,
  expandSkeduProgramResourceBlocks,
  isSkeduProgramDurationAllowed,
  listAutomaticMassageSlots,
  MASSAGE_AGENDA_STATUSES,
  MANUAL_ASSIGNMENT_REJECTION_STATUSES,
  normalizeDecimalInput,
  selectAutomaticMassageAssignment,
  serializePublicMassageTechnique,
  serializeDateOnly,
  validateMassageCancellationReason,
  validateMassageCartCapacity,
  validateSkeduTherapistSelection,
  validatePublicMassageLeadTime,
} from "./masajesRouter";

describe("massage agenda visibility", () => {
  it("keeps every standard booking status visible, including manual pending and system cancellations", () => {
    expect(MASSAGE_AGENDA_STATUSES).toEqual([
      "pending",
      "confirmed",
      "completed",
      "cancelled",
      "no_show",
    ]);
  });

  it("limits manual-assignment cleanup to explicitly rejected assignments", () => {
    expect(MANUAL_ASSIGNMENT_REJECTION_STATUSES).toEqual([
      "admin_rejected",
      "therapist_rejected",
    ]);
  });
});

describe("recurring therapist availability", () => {
  it("expands enabled weekly schedules into concrete future dates", () => {
    const availability = buildRecurringMassageAvailability({
      from: "2026-07-06",
      to: "2026-07-15",
      schedules: [
        {
          therapistId: 10,
          dayOfWeek: 1,
          startTime: "10:00",
          endTime: "18:00",
          available: 1,
        },
        {
          therapistId: 10,
          dayOfWeek: 2,
          startTime: "10:00",
          endTime: "18:00",
          available: 0,
        },
      ],
    });

    expect(availability.map((entry) => entry.date)).toEqual(["2026-07-06", "2026-07-13"]);
    expect(availability[0]).toEqual(expect.objectContaining({
      therapistId: 10,
      isAvailable: 1,
      startTime: "10:00",
      endTime: "18:00",
      generationSource: "weekly_schedule",
    }));
  });

  it("keeps temporary absences blocked but restores the recurring hours outside the range", () => {
    const availability = buildRecurringMassageAvailability({
      from: "2026-07-07",
      to: "2026-07-21",
      schedules: [{
        therapistId: 12,
        dayOfWeek: 2,
        startTime: "14:00",
        endTime: "22:00",
        available: 1,
        blockFrom: "2026-07-08",
        blockTo: "2026-07-14",
        blockReason: "Vacaciones",
      }],
    });

    expect(availability).toEqual([
      expect.objectContaining({ date: "2026-07-07", isAvailable: 1, startTime: "14:00" }),
      expect.objectContaining({
        date: "2026-07-14",
        isAvailable: 0,
        startTime: null,
        blockNotes: "Vacaciones",
      }),
      expect.objectContaining({ date: "2026-07-21", isAvailable: 1, startTime: "14:00" }),
    ]);
  });

  it("maintains a rolling horizon through the end of the twelfth future month", () => {
    expect(getRecurringMassageAvailabilityHorizon(new Date("2026-07-23T16:00:00.000Z"))).toEqual({
      from: "2026-07-23",
      to: "2027-07-31",
    });
  });
});

describe("Skedu massage programs", () => {
  it("uses the configured fixed price for each individual massage", () => {
    expect(getSkeduMassageUnitPrice(30)).toBe(35_000);
    expect(getSkeduMassageUnitPrice(50)).toBe(45_000);
    expect(getSkeduMassageUnitPrice(80)).toBe(0);
    expect(getSkeduMassageQuantity("simple")).toBe(1);
    expect(getSkeduMassageQuantity("double")).toBe(2);
  });

  it("allows 30 and 50 minutes for every Reconecta variant and only 30 for Reset", () => {
    for (const program of ["reconecta", "reconecta_detox", "bio_reconecta", "bio_reconecta_detox"]) {
      expect(isSkeduProgramDurationAllowed(program, 30)).toBe(true);
      expect(isSkeduProgramDurationAllowed(program, 50)).toBe(true);
    }
    expect(isSkeduProgramDurationAllowed("reset", 30)).toBe(true);
    expect(isSkeduProgramDurationAllowed("reset", 50)).toBe(false);
  });

  it("expands a double program into two therapist blocks but only one room block", () => {
    const blocks = expandSkeduProgramResourceBlocks([{
      therapistId: 3,
      secondTherapistId: 1,
      roomId: 2,
      startTime: "14:00",
      endTime: "14:30",
    }]);

    expect(blocks).toEqual([
      { therapistId: 3, roomId: 2, startTime: "14:00", endTime: "14:30" },
      { therapistId: 1, roomId: null, startTime: "14:00", endTime: "14:30" },
    ]);
  });

  it("requires two different therapists for double programs", () => {
    expect(() => validateSkeduTherapistSelection("simple", 1)).not.toThrow();
    expect(() => validateSkeduTherapistSelection("double", 1, 2)).not.toThrow();
    expect(() => validateSkeduTherapistSelection("double", 1)).toThrow("requiere dos terapeutas");
    expect(() => validateSkeduTherapistSelection("double", 1, 1)).toThrow("dos terapeutas distintos");
  });
});

describe("validateMassageCancellationReason", () => {
  it("requires an explicit written reason before cancelling a massage", () => {
    expect(validateMassageCancellationReason("El cliente canceló por enfermedad")).toBe(
      "El cliente canceló por enfermedad",
    );
    expect(() => validateMassageCancellationReason("   ")).toThrow("motivo de la cancelación");
    expect(() => validateMassageCancellationReason("No")).toThrow("motivo de la cancelación");
  });
});

describe("buildInhouseMonthRotation", () => {
  const rotation = buildInhouseMonthRotation({
    month: "2026-07",
    barbaraFirstWeekShift: "pm",
    barbaraId: 3,
    danielaId: 1,
    amStart: "10:00",
    amEnd: "18:00",
    pmStart: "14:00",
    pmEnd: "22:00",
  });

  it("schedules both therapists Tuesday through Friday with a 14:00-18:00 overlap", () => {
    const tuesday = rotation.filter((entry) => entry.date === "2026-07-07");
    expect(tuesday).toEqual([
      expect.objectContaining({ therapistId: 3, startTime: "10:00", endTime: "18:00" }),
      expect.objectContaining({ therapistId: 1, startTime: "14:00", endTime: "22:00" }),
    ]);
  });

  it("keeps Monday out of the automatic rotation", () => {
    expect(rotation.filter((entry) => entry.date === "2026-07-06")).toEqual([]);
  });

  it("adds Daniela every other Saturday while Barbara works every Saturday", () => {
    expect(rotation.filter((entry) => entry.date === "2026-07-04")).toEqual([
      expect.objectContaining({ therapistId: 3, shift: "pm" }),
    ]);
    expect(rotation.filter((entry) => entry.date === "2026-07-11")).toEqual([
      expect.objectContaining({ therapistId: 3, shift: "am" }),
      expect.objectContaining({ therapistId: 1, shift: "pm" }),
    ]);
  });
});

describe("getChileDateString", () => {
  it("uses the calendar date in Chile for automatic pending cleanup", () => {
    expect(getChileDateString(new Date("2026-07-15T02:30:00.000Z"))).toBe("2026-07-14");
    expect(getChileDateString(new Date("2026-07-15T15:00:00.000Z"))).toBe("2026-07-15");
  });
});

describe("getChileTimeString", () => {
  it("uses the local time in Chile for automatic completion", () => {
    expect(getChileTimeString(new Date("2026-07-15T02:30:00.000Z"))).toBe("22:30");
    expect(getChileTimeString(new Date("2026-07-15T15:05:00.000Z"))).toBe("11:05");
  });
});

describe("validatePublicMassageLeadTime", () => {
  const now = new Date("2026-07-15T15:00:00.000Z"); // 11:00 en Chile

  it("allows up to four simultaneous massages with exactly two hours notice", () => {
    expect(() => validatePublicMassageLeadTime(Array.from({ length: 4 }, () => ({
      bookingDate: "2026-07-15", startTime: "13:00",
    })), now)).not.toThrow();
  });

  it("rejects even one massage with less than two hours notice", () => {
    expect(() => validatePublicMassageLeadTime([
      { bookingDate: "2026-07-15", startTime: "12:30" },
    ], now)).toThrow("al menos 2 horas");
  });

  it("rejects dates or times that have already passed", () => {
    expect(() => validatePublicMassageLeadTime([
      { bookingDate: "2026-07-14", startTime: "18:00" },
    ], now)).toThrow("al menos 2 horas");
  });

  it("does not restrict a future date", () => {
    expect(() => validatePublicMassageLeadTime([
      { bookingDate: "2026-07-16", startTime: "10:00" },
    ], now)).not.toThrow();
  });
});

describe("validateMassageCartCapacity", () => {
  it("allows more than four massages in a cart when they use different times or days", () => {
    expect(() => validateMassageCartCapacity([
      ...Array.from({ length: 4 }, () => ({ bookingDate: "2026-07-20", startTime: "13:00", duration: 50 })),
      ...Array.from({ length: 2 }, () => ({ bookingDate: "2026-07-21", startTime: "14:00", duration: 50 })),
    ])).not.toThrow();
  });

  it("rejects more than four overlapping massages even when their start times differ", () => {
    expect(() => validateMassageCartCapacity([
      ...Array.from({ length: 4 }, () => ({ bookingDate: "2026-07-20", startTime: "13:00", duration: 80 })),
      { bookingDate: "2026-07-20", startTime: "13:30", duration: 50 },
    ])).toThrow("máximo de 4 masajes simultáneos");
  });

  it("allows back-to-back groups because they do not overlap", () => {
    expect(() => validateMassageCartCapacity([
      ...Array.from({ length: 4 }, () => ({ bookingDate: "2026-07-20", startTime: "13:00", duration: 50 })),
      ...Array.from({ length: 4 }, () => ({ bookingDate: "2026-07-20", startTime: "13:50", duration: 50 })),
    ])).not.toThrow();
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

  it("uses the fixed inhouse order Barbara, Daniela, then Tamara", () => {
    const base = {
      type: "inhouse" as const,
      callPriority: 99,
      scheduleStart: "10:00",
      scheduleEnd: "18:00",
    };
    const therapists = [
      { ...base, id: 2, name: "Tamara Muñoz" },
      { ...base, id: 1, name: "Daniela Caerols" },
      { ...base, id: 3, name: "Bárbara Frías" },
    ];

    const first = selectAutomaticMassageAssignment({
      therapists,
      bookings: [],
      rooms,
      startTime: "12:00",
      duration: 50,
    });
    expect(first?.therapist.id).toBe(3);

    const second = selectAutomaticMassageAssignment({
      therapists,
      bookings: [{ therapistId: 3, roomId: 20, startTime: "12:00", endTime: "12:50" }],
      rooms: [{ id: 20 }, { id: 21 }],
      startTime: "12:00",
      duration: 50,
    });
    expect(second?.therapist.id).toBe(1);

    const third = selectAutomaticMassageAssignment({
      therapists,
      bookings: [
        { therapistId: 3, roomId: 20, startTime: "12:00", endTime: "12:50" },
        { therapistId: 1, roomId: 21, startTime: "12:00", endTime: "12:50" },
      ],
      rooms: [{ id: 20 }, { id: 21 }, { id: 22 }],
      startTime: "12:00",
      duration: 50,
    });
    expect(third?.therapist.id).toBe(2);
  });

  it("fits four massages from the same cart into two double rooms", () => {
    const therapists = Array.from({ length: 4 }, (_, index) => ({
      id: index + 10,
      name: `Terapeuta ${index + 1}`,
      type: "freelance" as const,
      callPriority: index + 1,
      scheduleStart: "10:00",
      scheduleEnd: "18:00",
    }));
    const doubleRooms = [
      { id: 20, capacity: 2, allowCoupleBooking: 1 },
      { id: 21, capacity: 2, allowCoupleBooking: 1 },
    ];
    const candidateBookings: Array<{
      therapistId: number;
      roomId: number;
      startTime: string;
      endTime: string;
      groupKey: string;
    }> = [];

    for (let index = 0; index < 4; index += 1) {
      const assignment = selectAutomaticMassageAssignment({
        therapists,
        bookings: candidateBookings,
        rooms: doubleRooms,
        startTime: "12:00",
        duration: 50,
        groupKey: "cart-1",
      });
      expect(assignment).not.toBeNull();
      candidateBookings.push({
        therapistId: assignment!.therapist.id,
        roomId: assignment!.room.id,
        startTime: "12:00",
        endTime: assignment!.endTime,
        groupKey: "cart-1",
      });
    }

    expect(candidateBookings.filter((booking) => booking.roomId === 20)).toHaveLength(2);
    expect(candidateBookings.filter((booking) => booking.roomId === 21)).toHaveLength(2);
  });

  it("does not mix different carts in the same double room", () => {
    const assignment = selectAutomaticMassageAssignment({
      therapists: [{
        id: 2, name: "Disponible", type: "inhouse", callPriority: 1,
        scheduleStart: "10:00", scheduleEnd: "18:00",
      }],
      bookings: [{
        therapistId: 1, roomId: 20, startTime: "12:00", endTime: "12:50", groupKey: "cart-previous",
      }],
      rooms: [{ id: 20, capacity: 2, allowCoupleBooking: 1 }],
      startTime: "12:00",
      duration: 50,
      groupKey: "cart-new",
    });

    expect(assignment).toBeNull();
  });

  it("selects Daniela before Barbara starts her shift", () => {
    const assignment = selectAutomaticMassageAssignment({
      therapists: [
        { id: 3, name: "Bárbara Frías", type: "inhouse", callPriority: 1, scheduleStart: "14:00", scheduleEnd: "22:00" },
        { id: 1, name: "Daniela Caerols", type: "inhouse", callPriority: 2, scheduleStart: "10:00", scheduleEnd: "18:00" },
      ],
      bookings: [],
      rooms,
      startTime: "12:00",
      duration: 50,
    });

    expect(assignment?.therapist.id).toBe(1);
  });

  it("never assigns any therapist with less than two hours notice", () => {
    const now = new Date("2026-07-15T14:00:00.000Z"); // 10:00 en Chile
    const freelance = [{
      id: 20,
      name: "Freelance",
      type: "freelance" as const,
      callPriority: 1,
      scheduleStart: "10:00",
      scheduleEnd: "18:00",
    }];

    expect(selectAutomaticMassageAssignment({
      therapists: freelance,
      bookings: [],
      rooms,
      startTime: "11:30",
      duration: 20,
      bookingDate: "2026-07-15",
      now,
    })).toBeNull();

    expect(selectAutomaticMassageAssignment({
      therapists: freelance,
      bookings: [],
      rooms,
      startTime: "12:00",
      duration: 20,
      bookingDate: "2026-07-15",
      now,
    })?.therapist.id).toBe(20);
  });

  it("does not exempt inhouse therapists from the two-hour minimum", () => {
    const assignment = selectAutomaticMassageAssignment({
      therapists: [{
        id: 3,
        name: "Bárbara Frías",
        type: "inhouse",
        callPriority: 99,
        scheduleStart: "10:00",
        scheduleEnd: "18:00",
      }],
      bookings: [],
      rooms,
      startTime: "10:30",
      duration: 20,
      bookingDate: "2026-07-15",
      now: new Date("2026-07-15T14:00:00.000Z"),
    });

    expect(assignment).toBeNull();
  });

  it("never offers a past slot, including for inhouse therapists", () => {
    const assignment = selectAutomaticMassageAssignment({
      therapists: [{
        id: 3,
        name: "Bárbara Frías",
        type: "inhouse",
        callPriority: 1,
        scheduleStart: "10:00",
        scheduleEnd: "18:00",
      }],
      bookings: [],
      rooms,
      startTime: "09:30",
      duration: 20,
      bookingDate: "2026-07-15",
      now: new Date("2026-07-15T14:00:00.000Z"),
    });

    expect(assignment).toBeNull();
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

describe("listAutomaticMassageSlots", () => {
  it("lists a time only when the complete simultaneous group can be assigned", () => {
    const therapists = Array.from({ length: 4 }, (_, index) => ({
      id: index + 1,
      name: `Terapeuta ${index + 1}`,
      type: "inhouse" as const,
      callPriority: index + 1,
      scheduleStart: "12:00",
      scheduleEnd: "13:00",
    }));
    const rooms = [
      { id: 20, capacity: 2, allowCoupleBooking: 1 },
      { id: 21, capacity: 2, allowCoupleBooking: 1 },
    ];

    expect(listAutomaticMassageSlots({
      therapists,
      bookings: [],
      rooms,
      duration: 50,
      quantity: 4,
      bookingDate: "2026-07-25",
      now: new Date("2026-07-23T12:00:00.000Z"),
    })).toEqual([{ time: "12:00" }]);

    expect(listAutomaticMassageSlots({
      therapists: therapists.slice(0, 3),
      bookings: [],
      rooms,
      duration: 50,
      quantity: 4,
      bookingDate: "2026-07-25",
      now: new Date("2026-07-23T12:00:00.000Z"),
    })).toEqual([]);
  });

  it("hides same-day slots that start before the two-hour minimum", () => {
    expect(listAutomaticMassageSlots({
      therapists: [{
        id: 1,
        name: "Inhouse",
        type: "inhouse",
        callPriority: 1,
        scheduleStart: "14:00",
        scheduleEnd: "18:00",
      }],
      bookings: [],
      rooms: [{ id: 20 }],
      duration: 50,
      quantity: 1,
      bookingDate: "2026-07-23",
      now: new Date("2026-07-23T18:28:00.000Z"), // 14:28 en Chile
    })).toEqual([
      { time: "16:30" },
      { time: "17:00" },
    ]);
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
