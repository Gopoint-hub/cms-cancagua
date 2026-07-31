import { describe, expect, it } from "vitest";
import {
  summarizeShiftDay,
  type DashboardShiftInput,
} from "../shared/maintenanceShiftDashboard";

/**
 * El resumen del día es una función pura: recibe los turnos y la hora, y no
 * consulta nada. Estas pruebas cubren lo que decide qué se le muestra a la
 * administración — sobre todo qué cuenta como alerta y qué no.
 */

/** 14:30 en minutos, media tarde: sirve como "ahora" en casi todos los casos. */
const AFTERNOON = 14 * 60 + 30;

function shift(overrides: Partial<DashboardShiftInput> = {}): DashboardShiftInput {
  return {
    shift: "apertura",
    status: "draft",
    staffName: "Pepe",
    tasks: [],
    temperatures: [],
    waterQuality: [],
    cycles: [],
    ...overrides,
  };
}

describe("summarizeShiftDay", () => {
  it("marca el día como vacío cuando nadie abrió la ficha", () => {
    const summary = summarizeShiftDay({
      reportDate: "2026-07-31",
      nowMinutes: AFTERNOON,
      shifts: [],
    });

    expect(summary.hasData).toBe(false);
    expect(summary.alerts).toHaveLength(0);
    expect(summary.tasksPct).toBeNull();
  });

  it("cuenta las tareas de los dos turnos juntas", () => {
    const summary = summarizeShiftDay({
      reportDate: "2026-07-31",
      nowMinutes: AFTERNOON,
      shifts: [
        shift({
          tasks: [
            { taskKey: "a", label: "Una", scheduledTime: "09:00", done: 1 },
            { taskKey: "b", label: "Otra", scheduledTime: "20:00", done: 0 },
          ],
        }),
        shift({
          shift: "cierre",
          tasks: [{ taskKey: "c", label: "Tercera", scheduledTime: "18:00", done: 1 }],
        }),
      ],
    });

    expect(summary.tasksDone).toBe(2);
    expect(summary.tasksTotal).toBe(3);
    expect(summary.tasksPct).toBe(67);
  });

  it("alerta por temperatura fuera del rango del recinto", () => {
    const summary = summarizeShiftDay({
      reportDate: "2026-07-31",
      nowMinutes: AFTERNOON,
      shifts: [
        shift({
          temperatures: [
            // Biopiscina 1 va de 37 a 40: 35.2 está fuera.
            { venue: "biopiscina_1", roundTime: "10:00", temperature: "35.2" },
            { venue: "biopiscina_2", roundTime: "10:00", temperature: "38.0" },
          ],
        }),
      ],
    });

    const temperatureAlerts = summary.alerts.filter(
      (alert) => alert.kind === "temperatura_fuera_rango",
    );
    expect(temperatureAlerts).toHaveLength(1);
    expect(temperatureAlerts[0].level).toBe("alta");
    expect(temperatureAlerts[0].venue).toBe("Biopiscina 1");

    const bio1 = summary.temperatures.find((venue) => venue.key === "biopiscina_1");
    expect(bio1?.outOfRange).toBe(true);
    expect(bio1?.last).toBe(35.2);
  });

  it("no alerta por una ronda sin valor: que no se haya medido no es estar fuera de rango", () => {
    const summary = summarizeShiftDay({
      reportDate: "2026-07-31",
      nowMinutes: AFTERNOON,
      shifts: [
        shift({ temperatures: [{ venue: "hot_tub_1", roundTime: "10:00", temperature: null }] }),
      ],
    });

    expect(summary.alerts.filter((alert) => alert.kind === "temperatura_fuera_rango")).toHaveLength(0);
    expect(summary.temperatures.find((venue) => venue.key === "hot_tub_1")?.last).toBeNull();
  });

  it("solo considera atrasada la tarea cuya hora ya pasó", () => {
    const summary = summarizeShiftDay({
      reportDate: "2026-07-31",
      nowMinutes: 10 * 60, // 10:00
      shifts: [
        shift({
          tasks: [
            { taskKey: "vieja", label: "De las 09:00", scheduledTime: "09:00", done: 0 },
            { taskKey: "futura", label: "De las 12:00", scheduledTime: "12:00", done: 0 },
          ],
        }),
      ],
    });

    const overdue = summary.alerts.filter((alert) => alert.kind === "tarea_atrasada");
    expect(overdue).toHaveLength(1);
    expect(overdue[0].detail).toBe("De las 09:00");
  });

  it("no marca atrasada la bolsa de otras labores, que no tiene horario", () => {
    const summary = summarizeShiftDay({
      reportDate: "2026-07-31",
      nowMinutes: AFTERNOON,
      shifts: [
        shift({
          tasks: [{ taskKey: "pool", label: "Barrer", scheduledTime: null, isPool: 1, done: 0 }],
        }),
      ],
    });

    expect(summary.alerts.filter((alert) => alert.kind === "tarea_atrasada")).toHaveLength(0);
  });

  it("en un día pasado todo lo sin marcar cuenta como vencido", () => {
    const summary = summarizeShiftDay({
      reportDate: "2026-07-20",
      nowMinutes: null,
      shifts: [
        shift({
          tasks: [{ taskKey: "tarde", label: "De las 20:00", scheduledTime: "20:00", done: 0 }],
        }),
      ],
    });

    expect(summary.alerts.filter((alert) => alert.kind === "tarea_atrasada")).toHaveLength(1);
  });

  it("alerta por agua bajo el corte de transparencia y por muchas partículas", () => {
    const summary = summarizeShiftDay({
      reportDate: "2026-07-31",
      nowMinutes: AFTERNOON,
      shifts: [
        shift({
          waterQuality: [
            {
              venue: "biopiscina_1",
              transparency: 70,
              suspendedParticles: "muchas",
              settledParticles: "ausente",
              actions: "Se agregó floculante",
              recordedAt: "11:00",
            },
            { venue: "biopiscina_2", transparency: 95, suspendedParticles: "ausente" },
          ],
        }),
      ],
    });

    expect(summary.alerts.filter((alert) => alert.kind === "agua_turbia")).toHaveLength(1);
    expect(summary.alerts.filter((alert) => alert.kind === "particulas")).toHaveLength(1);
    expect(summary.water).toHaveLength(2);
  });

  it("un paso del ciclo sin hacer y con hora vencida es alerta alta", () => {
    const summary = summarizeShiftDay({
      reportDate: "2026-07-31",
      nowMinutes: AFTERNOON,
      shifts: [
        shift({
          cycles: [
            {
              cycleType: "hot_tub",
              venue: "hot_tub_1",
              bookingRef: "uuid-1",
              step: "llenado",
              plannedTime: "12:00",
              done: 0,
            },
            {
              cycleType: "hot_tub",
              venue: "hot_tub_1",
              bookingRef: "uuid-1",
              step: "entrega",
              plannedTime: "16:00",
              done: 0,
            },
          ],
        }),
      ],
    });

    const late = summary.alerts.filter((alert) => alert.kind === "ciclo_atrasado");
    expect(late).toHaveLength(1);
    expect(late[0].level).toBe("alta");

    // Los dos pasos son de la misma reserva: van en un solo grupo.
    expect(summary.cycles).toHaveLength(1);
    expect(summary.cycles[0].total).toBe(2);
    expect(summary.cycles[0].done).toBe(0);
  });

  it("separa los ciclos de dos reservas distintas del mismo hot tub", () => {
    const summary = summarizeShiftDay({
      reportDate: "2026-07-31",
      nowMinutes: AFTERNOON,
      shifts: [
        shift({
          cycles: [
            { cycleType: "hot_tub", venue: "hot_tub_2", bookingRef: "a", step: "llenado", plannedTime: "10:00", done: 1 },
            { cycleType: "hot_tub", venue: "hot_tub_2", bookingRef: "b", step: "llenado", plannedTime: "17:00", done: 0 },
          ],
        }),
      ],
    });

    expect(summary.cycles).toHaveLength(2);
  });

  it("avisa del turno que terminó y quedó en borrador", () => {
    const summary = summarizeShiftDay({
      reportDate: "2026-07-31",
      nowMinutes: 23 * 60, // 23:00, los dos turnos ya terminaron
      shifts: [
        shift({ shift: "apertura", status: "submitted" }),
        shift({ shift: "cierre", status: "draft" }),
      ],
    });

    const open = summary.alerts.filter((alert) => alert.kind === "turno_sin_cerrar");
    expect(open).toHaveLength(1);
    expect(open[0].shift).toBe("cierre");
  });

  it("no reclama por un turno en curso que todavía no termina", () => {
    const summary = summarizeShiftDay({
      reportDate: "2026-07-31",
      nowMinutes: 15 * 60, // 15:00: el cierre va hasta las 22:00
      shifts: [shift({ shift: "cierre", status: "draft" })],
    });

    expect(summary.alerts.filter((alert) => alert.kind === "turno_sin_cerrar")).toHaveLength(0);
  });

  it("pone las alertas altas antes que las medias, y dentro de cada nivel por hora", () => {
    const summary = summarizeShiftDay({
      reportDate: "2026-07-31",
      nowMinutes: AFTERNOON,
      shifts: [
        shift({
          tasks: [{ taskKey: "t", label: "Temprana", scheduledTime: "08:00", done: 0 }],
          temperatures: [
            { venue: "hot_tub_1", roundTime: "12:00", temperature: "30.0" },
            { venue: "hot_tub_2", roundTime: "10:00", temperature: "30.0" },
          ],
        }),
      ],
    });

    expect(summary.alerts[0].level).toBe("alta");
    expect(summary.alerts[0].time).toBe("10:00");
    expect(summary.alerts[1].time).toBe("12:00");
    expect(summary.alerts[summary.alerts.length - 1].level).toBe("media");
  });

  it("toma la ventana de filtrado del turno de cierre", () => {
    const summary = summarizeShiftDay({
      reportDate: "2026-07-31",
      nowMinutes: AFTERNOON,
      shifts: [
        shift({ shift: "apertura", filteringStart: "21:30", filteringEnd: "23:00" }),
        shift({ shift: "cierre", filteringStart: "19:00", filteringEnd: "24:00" }),
      ],
    });

    expect(summary.filtering).toBe("19:00–24:00");
  });
});
