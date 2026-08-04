export type BiopoolOccupancyInterval = {
  startTime: string;
  endTime: string;
  seats: number;
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
 * Returns the lowest number of seats available at any point of a candidate
 * stay. Intervals are half-open: a guest ending at 14:00 frees their seat for
 * another guest entering at 14:00.
 */
export function minimumAvailableSeats(
  capacity: number,
  candidate: Pick<BiopoolOccupancyInterval, "startTime" | "endTime">,
  occupancy: BiopoolOccupancyInterval[]
): number {
  const candidateStart = timeToMinutes(candidate.startTime);
  const candidateEnd = timeToMinutes(candidate.endTime);
  const checkpoints = new Set<number>([candidateStart]);

  for (const interval of occupancy) {
    const start = timeToMinutes(interval.startTime);
    const end = timeToMinutes(interval.endTime);
    if (start > candidateStart && start < candidateEnd) checkpoints.add(start);
    if (end > candidateStart && end < candidateEnd) checkpoints.add(end);
  }

  let peakUsed = 0;
  for (const checkpoint of Array.from(checkpoints)) {
    const used = occupancy.reduce((sum, interval) => {
      const start = timeToMinutes(interval.startTime);
      const end = timeToMinutes(interval.endTime);
      return checkpoint >= start && checkpoint < end
        ? sum + interval.seats
        : sum;
    }, 0);
    peakUsed = Math.max(peakUsed, used);
  }

  return Math.max(0, capacity - peakUsed);
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
