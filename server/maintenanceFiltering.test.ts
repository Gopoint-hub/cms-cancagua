import { describe, expect, it } from "vitest";
import {
  FILTERING_DEFAULT_END,
  FILTERING_DEFAULT_START,
  FILTERING_WARM_END,
  calculateFiltering,
  timeToMinutes,
} from "../shared/maintenanceFiltering";

/**
 * La regla de filtrado la dictó Lu y tiene varias correcciones suyas encima.
 * Estas pruebas fijan justamente esas correcciones, que son las que se
 * perdieron una vez al reescribir la lógica.
 */
describe("calculateFiltering", () => {
  it("con agua limpia usa el horario fijo de invierno", () => {
    const plan = calculateFiltering({ transparency: 100, lastBioExit: "18:00" });

    expect(plan.start).toBe(FILTERING_DEFAULT_START);
    expect(plan.end).toBe(FILTERING_DEFAULT_END);
    expect(plan.advanced).toBe(false);
    expect(plan.startReason).toContain("agua en buen estado");
  });

  it("sin medición de transparencia no adelanta nada", () => {
    // Un dato que nadie llenó no puede gatillar un cambio de operación.
    const plan = calculateFiltering({ transparency: null, lastBioExit: "17:00" });

    expect(plan.start).toBe(FILTERING_DEFAULT_START);
    expect(plan.advanced).toBe(false);
  });

  it("con agua turbia adelanta el inicio a la salida del último cliente de bios", () => {
    const plan = calculateFiltering({ transparency: 80, lastBioExit: "18:00" });

    expect(plan.start).toBe("18:00");
    expect(plan.advanced).toBe(true);
    expect(plan.startReason).toContain("se adelanta el filtrado");
  });

  it("NUNCA atrasa el inicio más allá de las 21:30, aunque la reserva termine después", () => {
    // Corrección expresa de Lu: las 21:30 son un techo. La primera versión
    // atrasaba el inicio hasta la salida del último cliente y estaba mal.
    const plan = calculateFiltering({ transparency: 70, lastBioExit: "22:00" });

    expect(plan.start).toBe(FILTERING_DEFAULT_START);
    expect(plan.advanced).toBe(false);
    expect(plan.startReason).toContain("lo más temprano que corresponde");
  });

  it("con agua turbia y sin reservas de bios parte en la hora base", () => {
    const plan = calculateFiltering({ transparency: 60, lastBioExit: null });

    expect(plan.start).toBe(FILTERING_DEFAULT_START);
    expect(plan.advanced).toBe(false);
    expect(plan.startReason).toContain("no hay");
  });

  it("estira hasta las 24:00 cuando mañana amanece sobre 9°", () => {
    const plan = calculateFiltering({ transparency: 100, tomorrowEarlyTemp: 12 });

    expect(plan.end).toBe(FILTERING_WARM_END);
    expect(plan.endReason).toContain("12°");
  });

  it("corta a las 23:00 cuando mañana amanece con 9° o menos", () => {
    // El corte es estricto: 9 exactos NO estiran la ventana.
    const plan = calculateFiltering({ transparency: 100, tomorrowEarlyTemp: 9 });

    expect(plan.end).toBe(FILTERING_DEFAULT_END);
  });

  it("sin pronóstico corta a las 23:00 y lo dice", () => {
    const plan = calculateFiltering({ transparency: 100 });

    expect(plan.end).toBe(FILTERING_DEFAULT_END);
    expect(plan.endReason).toContain("sin dato del clima");
  });

  it("calcula las horas de la ventana, incluido el corte de medianoche", () => {
    const base = calculateFiltering({ transparency: 100 });
    expect(base.hours).toBe(1.5);
    expect(base.summary).toBe("21:30–23:00 (1.5 h)");

    const largo = calculateFiltering({ transparency: 70, lastBioExit: "18:00", tomorrowEarlyTemp: 12 });
    expect(largo.hours).toBe(6);
    expect(largo.summary).toBe("18:00–24:00 (6 h)");
  });

  it("timeToMinutes entiende la medianoche como 24:00", () => {
    expect(timeToMinutes("21:30")).toBe(1290);
    expect(timeToMinutes("24:00")).toBe(1440);
  });
});
