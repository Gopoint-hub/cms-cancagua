import { getSkeduEvents } from "./skedu";

/**
 * Datos externos que alimentan la regla de filtrado del turno.
 *
 * El cálculo en sí vive en `shared/maintenanceFiltering.ts` y es una función
 * pura. Acá está solo lo que hay que ir a buscar afuera: a qué hora se va el
 * último cliente de biopiscinas, según Skedu.
 *
 * La ficha vieja (`mantencion.html`) nunca hablaba con Skedu para no dejar
 * credenciales en el navegador: leía un `dia.json` publicado cada 15 minutos.
 * Dentro del CMS eso ya no hace falta, porque la llamada sale del servidor.
 */

const CHILE_TIME_ZONE = "America/Santiago";

/** Una reserva se considera de biopiscinas si lo dice su servicio o su variante. */
function isBioBooking(booking: any): boolean {
  const name = `${booking?.Service?.Name ?? ""} ${booking?.Variant?.Name ?? ""}`;
  return name.toLowerCase().includes("biopiscina");
}

/** Fecha local (YYYY-MM-DD) de un instante ISO que Skedu entrega en UTC. */
function localDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: CHILE_TIME_ZONE });
}

/**
 * Hora local (HH:MM) de un instante ISO que Skedu entrega en UTC.
 *
 * Se fija `hourCycle: "h23"` a propósito: con `hour12: false` algunas versiones
 * de ICU devuelven "24:00" para la medianoche, y eso ordena mal y descuadra la
 * comparación con la hora base del filtrado.
 */
const TIME_FORMATTER = new Intl.DateTimeFormat("es-CL", {
  timeZone: CHILE_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function localTime(iso: string): string {
  return TIME_FORMATTER.format(new Date(iso));
}

/**
 * Cuándo termina la última reserva de biopiscinas del día.
 *
 * Devuelve la hora local en HH:MM y cuántas reservas de bios hubo. Si Skedu no
 * responde devuelve `null` en la hora y deja el error en `error`: la ficha debe
 * poder seguir usándose igual, con la regla cayendo a su horario base.
 */
export async function getLastBioExit(reportDate: string): Promise<{
  lastBioExit: string | null;
  bookingCount: number;
  error?: string;
}> {
  try {
    // Skedu filtra por StartsAt en UTC. Chile va en UTC-3/-4, así que se pide
    // una ventana holgada y después se filtra por la fecha local de verdad.
    const [year, month, day] = reportDate.split("-").map(Number);
    const dayBefore = new Date(Date.UTC(year, month - 1, day - 1))
      .toISOString()
      .slice(0, 10);
    const dayAfter = new Date(Date.UTC(year, month - 1, day + 1))
      .toISOString()
      .slice(0, 10);

    const data = await getSkeduEvents({ startDate: dayBefore, endDate: dayAfter });
    const items: any[] = data?.Data || data?.data || [];

    const exits = items
      .filter((booking) => !booking?.DeletedAt)
      .filter(isBioBooking)
      .map((booking) => booking?.EndsAt)
      .filter((endsAt: unknown): endsAt is string => typeof endsAt === "string" && endsAt !== "")
      .filter((endsAt: string) => localDate(endsAt) === reportDate)
      .map(localTime)
      .sort();

    return {
      lastBioExit: exits.length > 0 ? exits[exits.length - 1] : null,
      bookingCount: exits.length,
    };
  } catch (error) {
    // Que Skedu falle no puede dejar al turno sin ficha.
    const message = error instanceof Error ? error.message : String(error);
    console.error("[MantenciónTurno] No se pudo leer las reservas de bios:", message);
    return { lastBioExit: null, bookingCount: 0, error: message };
  }
}
