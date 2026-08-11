export const SAUNA_CAPACITY = 6;
export const SAUNA_DURATION_MINUTES = 60;
// Skedu guarda Interval=90 en los servicios, pero la agenda pública real ha
// ofrecido inicios cada 30 minutos. El aforo se calcula por solapamiento de la
// sesión de 60 minutos, no por separar artificialmente los inicios 90 minutos.
export const SAUNA_SLOT_INTERVAL_MINUTES = 30;

export type SaunaBookingKind =
  | "shared"
  | "private"
  | "staff"
  | "detox"
  | "manual";

export type SaunaCapacityItem = {
  guests: number;
  isPrivate?: boolean | number | null;
  capacityUsed?: number | null;
  status?: string | null;
};

export function capacityUsedBySaunaBooking(item: SaunaCapacityItem): number {
  if (item.status === "cancelled") return 0;
  if (Boolean(item.isPrivate)) return SAUNA_CAPACITY;
  if (typeof item.capacityUsed === "number" && item.capacityUsed > 0) {
    return Math.min(SAUNA_CAPACITY, item.capacityUsed);
  }
  if (item.guests >= 4) return SAUNA_CAPACITY;
  return Math.max(0, Math.min(3, item.guests));
}

export function availableSaunaSeats(items: SaunaCapacityItem[]): number {
  return Math.max(
    0,
    SAUNA_CAPACITY -
      items.reduce((total, item) => total + capacityUsedBySaunaBooking(item), 0)
  );
}

export function validateSaunaParty(
  guests: number,
  isPrivate: boolean
): string | null {
  if (!Number.isInteger(guests) || guests < 1 || guests > SAUNA_CAPACITY) {
    return "La cantidad de personas debe estar entre 1 y 6";
  }
  if (!isPrivate && guests >= 4) {
    return "Las reservas de 4 a 6 personas bloquean el sauna completo";
  }
  return null;
}

export function inferSaunaBooking(
  serviceName: string,
  variantName = ""
): {
  kind: SaunaBookingKind;
  guests: number;
  capacityUsed: number;
  isPrivate: boolean;
} {
  const value = `${serviceName} ${variantName}`.toLocaleLowerCase("es-CL");
  const namedPrivate = /privad/.test(value);
  const isDetox = /(?:bio[- ]?)?reconecta\s+detox|detox/.test(value);
  const isStaff = /staff|walk\s*in/.test(value);
  const explicit = value.match(
    /(?:^|\D)([1-6])\s*(?:persona|personas|pax)/
  )?.[1];
  const explicitGuests = Number(explicit || 1);
  const isPrivate =
    namedPrivate || (!isDetox && !isStaff && explicitGuests >= 4);
  const guests = namedPrivate
    ? SAUNA_CAPACITY
    : Math.max(1, Math.min(6, explicitGuests));

  return {
    kind: isPrivate
      ? "private"
      : isDetox
        ? "detox"
        : isStaff
          ? "staff"
          : "shared",
    guests,
    capacityUsed: isPrivate ? SAUNA_CAPACITY : guests,
    isPrivate,
  };
}

export function saunaIntervalsOverlap(
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string
): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}

export function addMinutesToTime(time: string, minutes: number): string {
  const [hours, mins] = time.split(":").map(Number);
  const value = hours * 60 + mins + minutes;
  return `${String(Math.floor(value / 60) % 24).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function buildSaunaSlots(
  openingTime: string,
  closingTime: string,
  intervalMinutes = SAUNA_SLOT_INTERVAL_MINUTES,
  durationMinutes = SAUNA_DURATION_MINUTES
): Array<{ startTime: string; endTime: string }> {
  const [openHour, openMinute] = openingTime.split(":").map(Number);
  const [closeHour, closeMinute] = closingTime.split(":").map(Number);
  const open = openHour * 60 + openMinute;
  const close = closeHour * 60 + closeMinute;
  const slots: Array<{ startTime: string; endTime: string }> = [];
  for (
    let start = open;
    start + durationMinutes <= close;
    start += intervalMinutes
  ) {
    const startTime = `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
    slots.push({
      startTime,
      endTime: addMinutesToTime(startTime, durationMinutes),
    });
  }
  return slots;
}
