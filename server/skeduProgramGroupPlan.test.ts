import { describe, expect, it } from "vitest";
import {
  buildSkeduProgramResourcePlan,
  getSkeduProgramSecondStartTime,
} from "./skeduProgramGroupPlan";

const therapists = [1, 2, 3, 4].map(id => ({ id, name: `T${id}` }));
const doubleRooms = [
  { id: 10, name: "Doble 1", type: "double" },
  { id: 11, name: "Doble 2", type: "double" },
];
const individualRoom = { id: 12, name: "Individual", type: "individual" };

describe("plan de recursos para programas grupales", () => {
  it("deja los diez minutos de preparación antes de la segunda tanda", () => {
    expect(getSkeduProgramSecondStartTime("10:00", 30)).toBe("10:40");
    expect(getSkeduProgramSecondStartTime("10:00", 50)).toBe("11:00");
  });

  it("distribuye tres personas simultáneas en una sala doble y otra sala", () => {
    const plan = buildSkeduProgramResourcePlan({
      partySize: 3,
      scheduleMode: "simultaneous",
      startTime: "12:00",
      primary: {
        availableTherapists: therapists,
        availableRooms: doubleRooms,
        endTime: "12:50",
      },
      secondary: {
        availableTherapists: therapists,
        availableRooms: [...doubleRooms, individualRoom],
        endTime: "12:50",
      },
      preferredRoomId: 10,
    });

    expect(plan.available).toBe(true);
    expect(plan.segments.map(segment => segment.partySize)).toEqual([2, 1]);
    expect(plan.segments.map(segment => segment.room.id)).toEqual([10, 12]);
    expect(
      plan.segments.flatMap(segment => segment.therapists.map(item => item.id))
    ).toEqual([1, 2, 3]);
  });

  it("exige cuatro terapeutas y las dos salas dobles para cuatro simultáneos", () => {
    const plan = buildSkeduProgramResourcePlan({
      partySize: 4,
      scheduleMode: "simultaneous",
      startTime: "15:00",
      primary: {
        availableTherapists: therapists,
        availableRooms: doubleRooms,
        endTime: "15:30",
      },
      preferredRoomId: 11,
    });

    expect(plan.available).toBe(true);
    expect(plan.requiredTherapists).toBe(4);
    expect(plan.requiredRooms).toBe(2);
    expect(plan.segments.map(segment => segment.room.id)).toEqual([11, 10]);
  });

  it("reutiliza dos terapeutas y una sala en 2+2 con preparación intermedia", () => {
    const plan = buildSkeduProgramResourcePlan({
      partySize: 4,
      scheduleMode: "two_by_two",
      startTime: "10:00",
      secondStartTime: "11:00",
      primary: {
        availableTherapists: therapists.slice(0, 3),
        availableRooms: doubleRooms,
        endTime: "10:50",
      },
      secondary: {
        availableTherapists: [therapists[0], therapists[1], therapists[3]],
        availableRooms: [doubleRooms[0]],
        endTime: "11:50",
      },
    });

    expect(plan.available).toBe(true);
    expect(plan.requiredTherapists).toBe(2);
    expect(plan.requiredRooms).toBe(1);
    expect(
      plan.segments.map(segment => [segment.startTime, segment.endTime])
    ).toEqual([
      ["10:00", "10:50"],
      ["11:00", "11:50"],
    ]);
    expect(plan.segments[1].therapists.map(item => item.id)).toEqual([1, 2]);
    expect(plan.segments[1].room.id).toBe(10);
  });

  it("rechaza un plan simultáneo sin suficientes terapeutas", () => {
    const plan = buildSkeduProgramResourcePlan({
      partySize: 4,
      scheduleMode: "simultaneous",
      startTime: "16:00",
      primary: {
        availableTherapists: therapists.slice(0, 3),
        availableRooms: doubleRooms,
        endTime: "16:30",
      },
    });

    expect(plan.available).toBe(false);
    expect(plan.segments).toEqual([]);
  });
});
