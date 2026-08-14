export type BiopoolOccupancyInterval = {
  startTime: string;
  endTime: string;
  seats: number;
  /** Kept for backwards compatibility; every interval consumes capacity for its full duration. */
  kind?: "entry" | "block";
};

export type BiopoolSlot = {
  startTime: string;
  endTime: string;
  durationMinutes: number;
};

export function timeToMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Hora inválida: ${value}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`Hora inválida: ${value}`);
  return hours * 60 + minutes;
}

export function minutesToTime(value: number): string {
  const normalized = Math.max(0, Math.min(value, 24 * 60 - 1));
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export function intervalsOverlap(
  left: Pick<BiopoolOccupancyInterval, "startTime" | "endTime">,
  right: Pick<BiopoolOccupancyInterval, "startTime" | "endTime">
): boolean {
  return (
    timeToMinutes(left.startTime) < timeToMinutes(right.endTime) &&
    timeToMinutes(right.startTime) < timeToMinutes(left.endTime)
  );
}

/**
 * Returns the minimum capacity available throughout a candidate stay.
 *
 * A guest admitted at 16:00 for four hours occupies a seat until 20:00, so a
 * new stay may only use the lowest remaining capacity found anywhere in its
 * interval. Intervals that merely touch at their boundaries do not overlap.
 */
export function minimumAvailableSeats(
  capacity: number,
  candidate: Pick<BiopoolOccupancyInterval, "startTime" | "endTime">,
  occupancy: BiopoolOccupancyInterval[]
): number {
  const candidateStart = timeToMinutes(candidate.startTime);
  const candidateEnd = timeToMinutes(candidate.endTime);
  if (candidateEnd <= candidateStart) return 0;

  const events = new Map<number, number>();
  for (const interval of occupancy) {
    if (interval.seats <= 0 || !intervalsOverlap(candidate, interval)) continue;
    const start = Math.max(candidateStart, timeToMinutes(interval.startTime));
    const end = Math.min(candidateEnd, timeToMinutes(interval.endTime));
    events.set(start, (events.get(start) ?? 0) + interval.seats);
    events.set(end, (events.get(end) ?? 0) - interval.seats);
  }

  let used = 0;
  let maximumUsed = 0;
  for (const [, delta] of [...events.entries()].sort(([left], [right]) => left - right)) {
    used += delta;
    maximumUsed = Math.max(maximumUsed, used);
  }

  return Math.max(0, capacity - maximumUsed);
}

export function buildEntrySlots(input: {
  firstEntryTime: string;
  lastEntryTime: string;
  slotIntervalMinutes: number;
  standardDurationMinutes: number;
  finalEntryDurationMinutes: number;
}): BiopoolSlot[] {
  const first = timeToMinutes(input.firstEntryTime);
  const last = timeToMinutes(input.lastEntryTime);
  if (input.slotIntervalMinutes <= 0 || last < first) return [];

  const slots: BiopoolSlot[] = [];
  for (let start = first; start <= last; start += input.slotIntervalMinutes) {
    const isFinal = start === last;
    const durationMinutes = isFinal
      ? input.finalEntryDurationMinutes
      : input.standardDurationMinutes;
    slots.push({
      startTime: minutesToTime(start),
      endTime: minutesToTime(start + durationMinutes),
      durationMinutes,
    });
  }
  return slots;
}

export function validateAdultChildQuantities(
  adults: number,
  children: number
): string | null {
  if (
    !Number.isInteger(adults) ||
    !Number.isInteger(children) ||
    adults < 0 ||
    children < 0
  ) {
    return "Las cantidades deben ser números enteros positivos";
  }
  if (adults + children < 1)
    return "La reserva debe incluir al menos una persona";
  if (children > 0 && adults < 1)
    return "Todo niño debe asistir acompañado por al menos un adulto";
  return null;
}

export function calculateRefundQuote(input: {
  amountPaidClp: number;
  feePercent: number;
  hoursBeforeStart: number;
  minimumNoticeHours: number;
  paymentIsPaid: boolean;
}) {
  const eligible =
    input.paymentIsPaid &&
    input.amountPaidClp > 0 &&
    input.hoursBeforeStart >= input.minimumNoticeHours;
  const feeClp = eligible
    ? Math.round((input.amountPaidClp * input.feePercent) / 100)
    : 0;
  return {
    eligible,
    grossClp: input.amountPaidClp,
    feeClp,
    netClp: eligible ? Math.max(0, input.amountPaidClp - feeClp) : 0,
  };
}
