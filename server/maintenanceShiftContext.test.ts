import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La salida del último cliente de biopiscinas viene de Skedu, en UTC. Estas
 * pruebas fijan la conversión a hora de Chile y el filtro de qué cuenta como
 * biopiscina: equivocarse ahí mueve la hora del filtrado sin que nadie lo note.
 */
const skeduMock = vi.hoisted(() => ({
  getSkeduEvents: vi.fn(),
}));

vi.mock("./skedu", () => skeduMock);

const { getLastBioExit } = await import("./maintenanceShiftContext");

/** Julio en Chile va en UTC-4, así que 22:00Z son las 18:00 locales. */
function booking(serviceName: string, endsAtUtc: string, extra: Record<string, unknown> = {}) {
  return {
    Service: { Name: serviceName },
    Variant: { Name: "" },
    EndsAt: endsAtUtc,
    ...extra,
  };
}

describe("getLastBioExit", () => {
  beforeEach(() => {
    skeduMock.getSkeduEvents.mockReset();
  });

  it("devuelve la última salida de bios en hora de Chile", async () => {
    skeduMock.getSkeduEvents.mockResolvedValue({
      Data: [
        booking("Biopiscina 2 personas", "2026-07-31T20:00:00Z"), // 16:00 local
        booking("Biopiscina 4 personas", "2026-07-31T22:00:00Z"), // 18:00 local
      ],
    });

    const result = await getLastBioExit("2026-07-31");

    expect(result.lastBioExit).toBe("18:00");
    expect(result.bookingCount).toBe(2);
  });

  it("ignora lo que no es biopiscina", async () => {
    skeduMock.getSkeduEvents.mockResolvedValue({
      Data: [
        booking("Biopiscina 2 personas", "2026-07-31T20:00:00Z"),
        booking("Hot Tub 2 personas", "2026-07-31T23:00:00Z"),
        booking("Masaje descontracturante", "2026-07-31T23:30:00Z"),
      ],
    });

    const result = await getLastBioExit("2026-07-31");

    expect(result.lastBioExit).toBe("16:00");
    expect(result.bookingCount).toBe(1);
  });

  it("reconoce la biopiscina cuando el nombre viene en la variante", async () => {
    skeduMock.getSkeduEvents.mockResolvedValue({
      Data: [
        {
          Service: { Name: "Pase Reconecta" },
          Variant: { Name: "Biopiscina 3 a 4 Personas" },
          EndsAt: "2026-07-31T21:00:00Z",
        },
      ],
    });

    const result = await getLastBioExit("2026-07-31");

    expect(result.lastBioExit).toBe("17:00");
  });

  it("descarta las reservas eliminadas", async () => {
    skeduMock.getSkeduEvents.mockResolvedValue({
      Data: [
        booking("Biopiscina 2 personas", "2026-07-31T20:00:00Z"),
        booking("Biopiscina 6 personas", "2026-07-31T23:00:00Z", {
          DeletedAt: "2026-07-30T10:00:00Z",
        }),
      ],
    });

    const result = await getLastBioExit("2026-07-31");

    expect(result.lastBioExit).toBe("16:00");
    expect(result.bookingCount).toBe(1);
  });

  it("descarta lo que cae en otro día local", async () => {
    // Se pide una ventana holgada a Skedu, así que llegan reservas de los días
    // vecinos: si no se filtran, la ficha muestra la salida del día anterior.
    skeduMock.getSkeduEvents.mockResolvedValue({
      Data: [
        booking("Biopiscina 2 personas", "2026-07-30T22:00:00Z"), // día anterior
        booking("Biopiscina 2 personas", "2026-07-31T19:00:00Z"), // 15:00 local
      ],
    });

    const result = await getLastBioExit("2026-07-31");

    expect(result.lastBioExit).toBe("15:00");
    expect(result.bookingCount).toBe(1);
  });

  it("si Skedu falla no revienta: devuelve el error y deja seguir el turno", async () => {
    skeduMock.getSkeduEvents.mockRejectedValue(new Error("timeout"));

    const result = await getLastBioExit("2026-07-31");

    expect(result.lastBioExit).toBeNull();
    expect(result.bookingCount).toBe(0);
    expect(result.error).toBe("timeout");
  });

  it("sin reservas de bios devuelve null y no inventa una hora", async () => {
    skeduMock.getSkeduEvents.mockResolvedValue({ Data: [] });

    const result = await getLastBioExit("2026-07-31");

    expect(result.lastBioExit).toBeNull();
    expect(result.bookingCount).toBe(0);
  });
});
