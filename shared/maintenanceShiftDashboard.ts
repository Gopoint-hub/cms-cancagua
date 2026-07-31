/**
 * Resumen del día para el dashboard de mantención.
 *
 * La ficha (`/cms/mantencion-turnos`) es de quien está de turno: registra. Esto
 * es la vista de administración: lee los dos turnos del día y responde una sola
 * pregunta — ¿hay algo que necesite atención?
 *
 * Todo el cálculo vive acá como función pura, sin base ni fechas del sistema,
 * por dos razones:
 *   · se puede probar sin levantar MySQL ni Skedu;
 *   · el servidor y la página muestran lo mismo, sin recalcular cada uno por su
 *     lado.
 *
 * Reemplaza la maqueta que estaba publicada en `cancagua.cl/mantencion-dashboard.html`,
 * que traía datos inventados a mano porque cuando se hizo no había dónde
 * guardar los reales.
 */

import { WATER_VENUES, type ShiftName } from "./maintenanceShiftCatalog";
import { FILTERING_TRANSPARENCY_CUTOFF, timeToMinutes } from "./maintenanceFiltering";

/**
 * Horario de cada turno. Se usa para saber si un turno ya debió cerrarse y para
 * ubicar las rondas de temperatura que ya tocaban.
 */
export const SHIFT_HOURS: Record<ShiftName, { start: string; end: string; label: string }> = {
  apertura: { start: "08:00", end: "16:00", label: "Apertura · 8:00–16:00" },
  cierre: { start: "14:00", end: "22:00", label: "Cierre · 14:00–22:00" },
};

/** Partículas que se consideran un problema por sí solas. */
const PARTICLES_ALERT = "muchas";

export type AlertLevel = "alta" | "media";

export type AlertKind =
  | "temperatura_fuera_rango"
  | "ronda_sin_medir"
  | "agua_turbia"
  | "particulas"
  | "tarea_atrasada"
  | "ciclo_atrasado"
  | "turno_sin_cerrar";

export type DashboardAlert = {
  level: AlertLevel;
  kind: AlertKind;
  /** Turno donde se detectó. */
  shift: ShiftName;
  /** Nombre legible del recinto, cuando aplica. */
  venue?: string;
  title: string;
  detail: string;
  /** Hora asociada (HH:MM), cuando la hay. */
  time?: string;
};

export type DashboardTask = {
  taskKey: string;
  scheduledTime?: string | null;
  label: string;
  isPool?: boolean | number | null;
  done?: boolean | number | null;
  doneAt?: string | null;
  responsible?: string | null;
};

export type DashboardTemperature = {
  venue: string;
  roundTime: string;
  /** MySQL devuelve los decimal como string; se acepta cualquiera de los dos. */
  temperature?: string | number | null;
  inRange?: boolean | number | null;
  note?: string | null;
  responsible?: string | null;
};

export type DashboardWaterQuality = {
  venue: string;
  transparency?: number | null;
  suspendedParticles?: string | null;
  settledParticles?: string | null;
  observation?: string | null;
  actions?: string | null;
  recordedAt?: string | null;
};

export type DashboardCycle = {
  cycleType: "hot_tub" | "sauna";
  venue: string;
  bookingRef?: string | null;
  step: string;
  plannedTime?: string | null;
  actualTime?: string | null;
  temperature?: string | number | null;
  done?: boolean | number | null;
  responsible?: string | null;
};

export type DashboardShiftInput = {
  id?: number;
  shift: ShiftName;
  status: "draft" | "submitted";
  staffName?: string | null;
  weatherSummary?: string | null;
  filteringStart?: string | null;
  filteringEnd?: string | null;
  filteringRule?: string | null;
  pendingNotes?: string | null;
  handoverNotes?: string | null;
  tasks: DashboardTask[];
  temperatures: DashboardTemperature[];
  waterQuality: DashboardWaterQuality[];
  cycles: DashboardCycle[];
};

export type SummarizeInput = {
  /** Fecha del día que se mira, YYYY-MM-DD. */
  reportDate: string;
  /**
   * Minutos transcurridos del día en el momento de mirar, o `null` si la fecha
   * ya pasó (entonces todo horario cuenta como vencido). Se recibe en vez de
   * leerlo del reloj para que la función sea pura y probable.
   */
  nowMinutes: number | null;
  shifts: DashboardShiftInput[];
};

export type VenueTemperatures = {
  key: string;
  name: string;
  min: number;
  max: number;
  readings: {
    roundTime: string;
    temperature: number | null;
    inRange: boolean;
    note?: string | null;
    shift: ShiftName;
  }[];
  /** Última lectura con valor, la que interesa de un vistazo. */
  last: number | null;
  lastTime: string | null;
  /** Si esa última lectura está dentro del rango del recinto. */
  lastInRange: boolean;
  /** Si alguna ronda del día salió fuera de rango, aunque después se corrigiera. */
  outOfRange: boolean;
};

export type ShiftSummary = {
  shift: ShiftName;
  label: string;
  status: "draft" | "submitted";
  staffName: string | null;
  tasksDone: number;
  tasksTotal: number;
  /** Tareas con hora ya cumplida que siguen sin marcar. */
  tasksOverdue: number;
  filtering: string | null;
  filteringRule: string | null;
  pendingNotes: string | null;
  handoverNotes: string | null;
};

export type CycleGroup = {
  cycleType: "hot_tub" | "sauna";
  venue: string;
  venueName: string;
  bookingRef: string | null;
  steps: {
    step: string;
    plannedTime: string | null;
    actualTime: string | null;
    temperature: number | null;
    done: boolean;
    late: boolean;
  }[];
  done: number;
  total: number;
};

export type DaySummary = {
  reportDate: string;
  /** false cuando no hay ningún reporte cargado para el día. */
  hasData: boolean;
  shifts: ShiftSummary[];
  tasksDone: number;
  tasksTotal: number;
  /** Porcentaje de avance, 0–100. `null` si no hay tareas cargadas. */
  tasksPct: number | null;
  alerts: DashboardAlert[];
  temperatures: VenueTemperatures[];
  water: (DashboardWaterQuality & { venueName: string; shift: ShiftName })[];
  cycles: CycleGroup[];
  filtering: string | null;
};

function isTrue(value: boolean | number | null | undefined): boolean {
  return value === true || value === 1;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function venueName(key: string): string {
  return WATER_VENUES.find((venue) => venue.key === key)?.name ?? key;
}

/**
 * ¿Ya pasó esa hora?
 *
 * Con `nowMinutes === null` (un día anterior) todo se considera vencido: si
 * quedó sin marcar ayer, ya no se va a marcar.
 */
function isPast(time: string | null | undefined, nowMinutes: number | null): boolean {
  if (!time) return false;
  if (nowMinutes === null) return true;
  return timeToMinutes(time) <= nowMinutes;
}

const STEP_LABELS: Record<string, string> = {
  llenado: "Llenado",
  entrega: "Entrega",
  vaciado: "Vaciado",
  higienizado: "Higienizado",
  encendido: "Encendido",
};

export function stepLabel(step: string): string {
  return STEP_LABELS[step] ?? step;
}

/**
 * Arma el resumen del día y la lista de alertas.
 *
 * Las alertas van ordenadas por gravedad y, dentro de cada nivel, por hora: lo
 * primero de la lista es lo primero que hay que ir a mirar.
 */
export function summarizeShiftDay(input: SummarizeInput): DaySummary {
  const { reportDate, nowMinutes, shifts } = input;
  const alerts: DashboardAlert[] = [];

  // ---- turnos y tareas ----
  const shiftSummaries: ShiftSummary[] = shifts.map((shift) => {
    const tasks = shift.tasks ?? [];
    const done = tasks.filter((task) => isTrue(task.done)).length;

    // "Otras labores" no tiene hora: no puede estar atrasada.
    const overdue = tasks.filter(
      (task) =>
        !isTrue(task.done) &&
        !isTrue(task.isPool) &&
        isPast(task.scheduledTime, nowMinutes),
    );

    for (const task of overdue) {
      alerts.push({
        level: "media",
        kind: "tarea_atrasada",
        shift: shift.shift,
        title: `Tarea sin marcar de las ${task.scheduledTime}`,
        detail: task.label,
        time: task.scheduledTime ?? undefined,
      });
    }

    const filtering =
      shift.filteringStart && shift.filteringEnd
        ? `${shift.filteringStart}–${shift.filteringEnd}`
        : null;

    // Un turno cuyo horario ya terminó y sigue en borrador no dejó traspaso.
    if (shift.status === "draft" && isPast(SHIFT_HOURS[shift.shift].end, nowMinutes)) {
      alerts.push({
        level: "media",
        kind: "turno_sin_cerrar",
        shift: shift.shift,
        title: `Turno de ${shift.shift} sin cerrar`,
        detail:
          `Terminó a las ${SHIFT_HOURS[shift.shift].end} y la ficha sigue en borrador, ` +
          "así que no dejó traspaso al turno siguiente.",
        time: SHIFT_HOURS[shift.shift].end,
      });
    }

    return {
      shift: shift.shift,
      label: SHIFT_HOURS[shift.shift].label,
      status: shift.status,
      staffName: shift.staffName ?? null,
      tasksDone: done,
      tasksTotal: tasks.length,
      tasksOverdue: overdue.length,
      filtering,
      filteringRule: shift.filteringRule ?? null,
      pendingNotes: shift.pendingNotes ?? null,
      handoverNotes: shift.handoverNotes ?? null,
    };
  });

  // ---- temperaturas por recinto ----
  const temperatures: VenueTemperatures[] = WATER_VENUES.map((venue) => {
    const readings: VenueTemperatures["readings"] = [];

    for (const shift of shifts) {
      for (const row of shift.temperatures ?? []) {
        if (row.venue !== venue.key) continue;
        const value = toNumber(row.temperature);
        const within = value === null ? true : value >= venue.min && value <= venue.max;

        readings.push({
          roundTime: row.roundTime,
          temperature: value,
          inRange: within,
          note: row.note,
          shift: shift.shift,
        });

        if (value !== null && !within) {
          alerts.push({
            level: "alta",
            kind: "temperatura_fuera_rango",
            shift: shift.shift,
            venue: venue.name,
            title: `${venue.name} a ${value}°`,
            detail:
              `Fuera del rango ${venue.min}–${venue.max}° en la ronda de las ${row.roundTime}.` +
              (row.note ? ` Anotaron: ${row.note}` : ""),
            time: row.roundTime,
          });
        }
      }
    }

    readings.sort((a, b) => timeToMinutes(a.roundTime) - timeToMinutes(b.roundTime));

    const withValue = readings.filter((reading) => reading.temperature !== null);
    const last = withValue.length > 0 ? withValue[withValue.length - 1] : null;

    return {
      key: venue.key,
      name: venue.name,
      min: venue.min,
      max: venue.max,
      readings,
      last: last?.temperature ?? null,
      lastTime: last?.roundTime ?? null,
      lastInRange: last ? last.inRange : true,
      outOfRange: readings.some((reading) => reading.temperature !== null && !reading.inRange),
    };
  });

  // ---- calidad del agua ----
  const water: DaySummary["water"] = [];
  for (const shift of shifts) {
    for (const row of shift.waterQuality ?? []) {
      water.push({ ...row, venueName: venueName(row.venue), shift: shift.shift });

      if (typeof row.transparency === "number" && row.transparency < FILTERING_TRANSPARENCY_CUTOFF) {
        alerts.push({
          level: "media",
          kind: "agua_turbia",
          shift: shift.shift,
          venue: venueName(row.venue),
          title: `${venueName(row.venue)} al ${row.transparency}% de transparencia`,
          detail:
            `Bajo el ${FILTERING_TRANSPARENCY_CUTOFF}% que gatilla adelantar el filtrado.` +
            (row.actions ? ` Medidas tomadas: ${row.actions}` : " Sin medidas anotadas."),
          time: row.recordedAt ?? undefined,
        });
      }

      const heavy: string[] = [];
      if (row.suspendedParticles === PARTICLES_ALERT) heavy.push("en suspensión");
      if (row.settledParticles === PARTICLES_ALERT) heavy.push("decantadas");
      if (heavy.length > 0) {
        alerts.push({
          level: "media",
          kind: "particulas",
          shift: shift.shift,
          venue: venueName(row.venue),
          title: `${venueName(row.venue)}: muchas partículas ${heavy.join(" y ")}`,
          detail: row.observation ?? "Sin observación anotada.",
          time: row.recordedAt ?? undefined,
        });
      }
    }
  }

  // ---- ciclos de hot tubs y saunas ----
  const groups = new Map<string, CycleGroup>();
  for (const shift of shifts) {
    for (const row of shift.cycles ?? []) {
      const key = `${row.cycleType}|${row.venue}|${row.bookingRef ?? ""}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          cycleType: row.cycleType,
          venue: row.venue,
          venueName: venueName(row.venue),
          bookingRef: row.bookingRef ?? null,
          steps: [],
          done: 0,
          total: 0,
        };
        groups.set(key, group);
      }

      const isDone = isTrue(row.done);
      const late = !isDone && isPast(row.plannedTime, nowMinutes);

      group.steps.push({
        step: row.step,
        plannedTime: row.plannedTime ?? null,
        actualTime: row.actualTime ?? null,
        temperature: toNumber(row.temperature),
        done: isDone,
        late,
      });
      group.total += 1;
      if (isDone) group.done += 1;

      if (late) {
        // Un paso atrasado del ciclo afecta a un cliente con reserva: pesa más
        // que una tarea del checklist.
        alerts.push({
          level: "alta",
          kind: "ciclo_atrasado",
          shift: shift.shift,
          venue: group.venueName,
          title: `${group.venueName}: ${stepLabel(row.step).toLowerCase()} sin hacer`,
          detail: `Estaba planificado para las ${row.plannedTime} y no está marcado.`,
          time: row.plannedTime ?? undefined,
        });
      }
    }
  }

  // Array.from y no el spread del iterador: el tsconfig del repo no fija
  // `target`, así que iterar un Map directo no compila (TS2802).
  for (const group of Array.from(groups.values())) {
    group.steps.sort((a, b) => {
      if (!a.plannedTime) return 1;
      if (!b.plannedTime) return -1;
      return timeToMinutes(a.plannedTime) - timeToMinutes(b.plannedTime);
    });
  }

  const tasksDone = shiftSummaries.reduce((total, shift) => total + shift.tasksDone, 0);
  const tasksTotal = shiftSummaries.reduce((total, shift) => total + shift.tasksTotal, 0);

  // El filtrado del día es el que dejó el turno de cierre; si no alcanzó a
  // guardarlo, sirve el de apertura.
  const filtering =
    shiftSummaries.find((shift) => shift.shift === "cierre")?.filtering ??
    shiftSummaries.find((shift) => shift.shift === "apertura")?.filtering ??
    null;

  const levelWeight: Record<AlertLevel, number> = { alta: 0, media: 1 };
  alerts.sort((a, b) => {
    if (levelWeight[a.level] !== levelWeight[b.level]) {
      return levelWeight[a.level] - levelWeight[b.level];
    }
    if (a.time && b.time) return timeToMinutes(a.time) - timeToMinutes(b.time);
    if (a.time) return -1;
    if (b.time) return 1;
    return 0;
  });

  return {
    reportDate,
    hasData: shifts.length > 0,
    shifts: shiftSummaries,
    tasksDone,
    tasksTotal,
    tasksPct: tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : null,
    alerts,
    temperatures,
    water,
    cycles: Array.from(groups.values()),
    filtering,
  };
}
