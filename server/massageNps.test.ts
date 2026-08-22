import { describe, expect, it } from "vitest";
import {
  buildSkeduProgramNpsCandidates,
  chileLocalDateTimeToUtc,
} from "./massageNps";

describe("chileLocalDateTimeToUtc", () => {
  it("convierte correctamente el horario de invierno de Chile", () => {
    expect(chileLocalDateTimeToUtc("2026-07-23", "14:30").toISOString()).toBe(
      "2026-07-23T18:30:00.000Z"
    );
  });

  it("convierte correctamente el horario de verano de Chile", () => {
    expect(chileLocalDateTimeToUtc("2026-01-23", "14:30").toISOString()).toBe(
      "2026-01-23T17:30:00.000Z"
    );
  });
});

describe("NPS de programas grupales", () => {
  it("envía una sola encuesta al líder después de terminar la segunda tanda", () => {
    const rows = [
      {
        bookingId: 101,
        bookingGroupId: "grupo-1",
        groupSequence: 1,
        serviceName: "reconecta",
        clientName: "Responsable",
        clientPhone: "+56911111111",
        serviceDate: "2026-08-22",
        endTime: "10:50",
        status: "completed",
      },
      {
        bookingId: 102,
        bookingGroupId: "grupo-1",
        groupSequence: 2,
        serviceName: "reconecta",
        clientName: "Tercer cliente",
        clientPhone: null,
        serviceDate: "2026-08-22",
        endTime: "11:50",
        status: "completed",
      },
    ];

    expect(buildSkeduProgramNpsCandidates(rows)).toEqual([
      expect.objectContaining({
        bookingId: 101,
        clientPhone: "+56911111111",
        endTime: "11:50",
      }),
    ]);
  });

  it("espera a que todas las tandas estén confirmadas o completadas", () => {
    expect(
      buildSkeduProgramNpsCandidates([
        {
          bookingId: 201,
          bookingGroupId: "grupo-2",
          groupSequence: 1,
          serviceName: "bio_reconecta",
          clientName: "Responsable",
          clientPhone: "+56911111111",
          serviceDate: "2026-08-22",
          endTime: "12:50",
          status: "completed",
        },
        {
          bookingId: 202,
          bookingGroupId: "grupo-2",
          groupSequence: 2,
          serviceName: "bio_reconecta",
          clientName: "Tercer cliente",
          clientPhone: null,
          serviceDate: "2026-08-22",
          endTime: "12:50",
          status: "pending",
        },
      ])
    ).toEqual([]);
  });
});
