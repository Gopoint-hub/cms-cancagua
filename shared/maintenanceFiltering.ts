/**
 * Regla de filtrado de las biopiscinas.
 *
 * La dictó Luciana el 30-jul-2026 y hasta ahora vivía suelta en el JavaScript de
 * la ficha (`mantencion.html`). Acá queda como función pura para poder probarla
 * y para que la ficha del CMS y el reporte muestren lo mismo.
 *
 * La regla, en palabras de ella:
 *
 *   · Base de invierno: filtrado fijo de 21:30 a 23:00.
 *   · Si el agua sale poco transparente se busca una ventana más larga: el
 *     filtrado se ADELANTA a la salida de los últimos clientes de biopiscinas,
 *     siempre que esa salida sea antes de las 21:30. La hora sale de Skedu
 *     (`EndsAt`), no se estima.
 *   · Si mañana a primera hora se esperan más de 9°, se puede estirar hasta las
 *     24:00. La referencia es la temperatura de las 08:00 de MAÑANA, no la
 *     máxima del día: el agua se enfría de noche, así que importa con cuánto
 *     frío amanece.
 *
 * ⚠️ Las 21:30 son un TECHO, nunca se atrasan. Aunque la última reserva termine
 * a las 22:00, el filtrado igual parte a las 21:30: el agua tarda en enfriarse
 * una vez que empieza a filtrar. Lu corrigió esto expresamente porque la primera
 * versión atrasaba el inicio hasta la salida del último cliente.
 *
 * Dos valores los puse yo y siguen sin confirmación de Lu:
 *   · El corte de "poco transparente" en 90%. Ella pidió registrar el
 *     porcentaje, pero no dijo desde cuál se gatilla.
 *   · La base 21:30–23:00 es "de invierno". No está definido qué corresponde en
 *     verano.
 */

/** Bajo este porcentaje el agua se considera poco transparente. Sin confirmar. */
export const FILTERING_TRANSPARENCY_CUTOFF = 90;
/** Hora base de inicio. Es un techo: solo se adelanta, nunca se atrasa. */
export const FILTERING_DEFAULT_START = "21:30";
/** Corte normal. */
export const FILTERING_DEFAULT_END = "23:00";
/** Corte cuando mañana amanece templado. */
export const FILTERING_WARM_END = "24:00";
/** Sobre estos grados a primera hora de mañana se puede estirar el filtrado. */
export const FILTERING_TOMORROW_TEMP_CUTOFF = 9;
/** La temperatura de referencia es la de mañana a esta hora. */
export const FILTERING_REFERENCE_HOUR = 8;

export type FilteringInput = {
  /**
   * Transparencia del agua en %, la peor de las biopiscinas medidas. Si no hay
   * medición se asume agua en buen estado, igual que hacía la ficha.
   */
  transparency?: number | null;
  /** Salida del último cliente de biopiscinas (HH:MM), según Skedu. */
  lastBioExit?: string | null;
  /** Temperatura esperada mañana a las 08:00, en grados. */
  tomorrowEarlyTemp?: number | null;
};

export type FilteringPlan = {
  /** Hora de inicio sugerida, HH:MM. */
  start: string;
  /** Hora de término sugerida, HH:MM (puede ser "24:00"). */
  end: string;
  /** Duración de la ventana en horas. */
  hours: number;
  /** Por qué esa hora de inicio, en lenguaje del turno. */
  startReason: string;
  /** Por qué esa hora de término. */
  endReason: string;
  /**
   * true cuando el filtrado se adelantó respecto de la base: hay que ir a
   * ponerlo antes y conviene destacarlo en la ficha.
   */
  advanced: boolean;
  /** Resumen de una línea, el mismo que va al reporte del turno. */
  summary: string;
};

/** "21:30" → 1290. Acepta "24:00" (=1440) para el corte de medianoche. */
export function timeToMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatHours(hours: number): string {
  return hours.toFixed(1).replace(".0", "");
}

/**
 * Calcula la ventana de filtrado para el día.
 *
 * No consulta nada: recibe los tres datos y decide. Así se puede probar y no
 * depende de que Skedu o el pronóstico respondan.
 */
export function calculateFiltering(input: FilteringInput): FilteringPlan {
  const { transparency, lastBioExit, tomorrowEarlyTemp } = input;

  // Sin medición se asume agua limpia: es lo que hacía la ficha, y evita
  // adelantar el filtrado por un dato que nadie llenó.
  const cloudy =
    typeof transparency === "number" && transparency < FILTERING_TRANSPARENCY_CUTOFF;

  // ---- hasta cuándo ----
  let end = FILTERING_DEFAULT_END;
  let endReason: string;
  if (typeof tomorrowEarlyTemp === "number") {
    const rounded = Math.round(tomorrowEarlyTemp);
    if (tomorrowEarlyTemp > FILTERING_TOMORROW_TEMP_CUTOFF) {
      end = FILTERING_WARM_END;
      endReason =
        `mañana a las ${FILTERING_REFERENCE_HOUR}:00 se esperan ${rounded}° — sobre ` +
        `${FILTERING_TOMORROW_TEMP_CUTOFF}°, así que se puede estirar hasta las ${FILTERING_WARM_END}`;
    } else {
      endReason =
        `mañana a las ${FILTERING_REFERENCE_HOUR}:00 se esperan ${rounded}° — ` +
        `${FILTERING_TOMORROW_TEMP_CUTOFF}° o menos, así que se corta a las ${FILTERING_DEFAULT_END}`;
    }
  } else {
    endReason = `sin dato del clima de mañana: se corta a las ${FILTERING_DEFAULT_END}`;
  }

  // ---- desde cuándo ----
  // Las 21:30 solo se adelantan, y solo si el agua salió turbia y los clientes
  // ya se fueron antes de esa hora.
  let start = FILTERING_DEFAULT_START;
  let startReason: string;
  let advanced = false;

  const exitsEarly =
    Boolean(lastBioExit) &&
    timeToMinutes(lastBioExit as string) < timeToMinutes(FILTERING_DEFAULT_START);

  if (cloudy && exitsEarly) {
    start = lastBioExit as string;
    advanced = true;
    startReason =
      `agua bajo ${FILTERING_TRANSPARENCY_CUTOFF}% de transparencia y los últimos ` +
      `clientes de biopiscinas salen a las ${lastBioExit}: se adelanta el filtrado para ganar horas`;
  } else if (cloudy && lastBioExit) {
    startReason =
      `agua bajo ${FILTERING_TRANSPARENCY_CUTOFF}% de transparencia, pero la última ` +
      `reserva de biopiscinas va hasta las ${lastBioExit}: igual parte a las ` +
      `${FILTERING_DEFAULT_START}, que es lo más temprano que corresponde`;
  } else if (cloudy) {
    startReason =
      `agua bajo ${FILTERING_TRANSPARENCY_CUTOFF}% de transparencia, pero hoy no hay ` +
      `reservas de biopiscinas: partir a las ${FILTERING_DEFAULT_START}`;
  } else {
    startReason = "agua en buen estado: va el horario fijo de invierno";
  }

  const hours = (timeToMinutes(end) - timeToMinutes(start)) / 60;

  return {
    start,
    end,
    hours,
    startReason,
    endReason,
    advanced,
    summary: `${start}–${end} (${formatHours(hours)} h)`,
  };
}
