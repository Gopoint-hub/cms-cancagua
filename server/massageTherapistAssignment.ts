import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import {
  massageBookings,
  massageProgramBookings,
  massageTechniques,
  massageTherapistAssignmentRequests,
  massageTherapistAvailability,
  massageTherapists,
  massageTherapistTechniques,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { sendWhatsApp } from "./_core/whapi";
import { getDb } from "./db";
import { affectedRows } from "./massageCheckout";
import { TAMARA_MUNOZ_PHONE } from "./massageContacts";

export const THERAPIST_RESPONSE_WINDOW_MS = 30 * 60 * 1000;
const PREPARATION_MINUTES = 10;
const INHOUSE_PRIORITY = new Map<number, number>([
  [3, 0], // Bárbara Frías
  [1, 1], // Daniela Caerols
  [2, 2], // Tamara Muñoz
]);

export type AssignmentBookingType = "massage" | "skedu_program";
export type AssignmentAction = "confirm" | "reject";

type Candidate = {
  id: number;
  name: string | null;
  phone: string | null;
  type: "inhouse" | "freelance";
  callPriority: number | null;
  scheduleStart: string;
  scheduleEnd: string;
};

type BlockingBooking = {
  therapistId: number | null;
  secondTherapistId?: number | null;
  startTime: string;
  endTime: string;
};

type AssignmentBooking = {
  bookingType: AssignmentBookingType;
  bookingId: number;
  slotCount: number;
  clientName: string;
  serviceName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  duration: number;
  status: string;
  techniqueId: number | null;
  therapistId: number | null;
  secondTherapistId: number | null;
};

export type AssignmentRequestView = {
  state: "pending" | "confirmed" | "rejected" | "expired" | "processed" | "invalid";
  therapistName?: string;
  clientName?: string;
  serviceName?: string;
  bookingDate?: string;
  startTime?: string;
  endTime?: string;
  expiresAt?: Date;
};

const parseTimeMinutes = (value: string) => {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};

const overlaps = (startA: number, endA: number, startB: number, endB: number) =>
  startA < endB && endA > startB;

const serializeDate = (value: unknown) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "").slice(0, 10);

const humanDate = (value: string) => new Intl.DateTimeFormat("es-CL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "America/Santiago",
}).format(new Date(`${value}T12:00:00`));

const chileNow = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    minutes: Number(value("hour")) * 60 + Number(value("minute")),
  };
};

export function isTherapistAssignmentExpired(expiresAt: Date, now = new Date()) {
  return expiresAt.getTime() <= now.getTime();
}

export function selectNextTherapistCandidate(input: {
  candidates: Candidate[];
  blockers: BlockingBooking[];
  attemptedTherapistIds: Set<number>;
  excludedTherapistIds?: Set<number>;
  preferredTherapistId?: number | null;
  startTime: string;
  endTime: string;
}): Candidate | null {
  const requestedStart = parseTimeMinutes(input.startTime);
  const requestedEnd = parseTimeMinutes(input.endTime);
  const excluded = input.excludedTherapistIds ?? new Set<number>();
  const ordered = [...input.candidates].sort((left, right) => {
    if (left.id === input.preferredTherapistId) return -1;
    if (right.id === input.preferredTherapistId) return 1;
    const typeDifference = (left.type === "inhouse" ? 0 : 1) - (right.type === "inhouse" ? 0 : 1);
    if (typeDifference !== 0) return typeDifference;
    if (left.type === "inhouse" && right.type === "inhouse") {
      const priorityDifference = (INHOUSE_PRIORITY.get(left.id) ?? 99) - (INHOUSE_PRIORITY.get(right.id) ?? 99);
      if (priorityDifference !== 0) return priorityDifference;
    }
    const callDifference = (left.callPriority ?? 99) - (right.callPriority ?? 99);
    return callDifference || (left.name ?? "").localeCompare(right.name ?? "");
  });

  return ordered.find((candidate) => {
    if (!candidate.phone || input.attemptedTherapistIds.has(candidate.id) || excluded.has(candidate.id)) {
      return false;
    }
    const scheduleStart = parseTimeMinutes(candidate.scheduleStart);
    const scheduleEnd = parseTimeMinutes(candidate.scheduleEnd);
    if (requestedStart < scheduleStart || requestedEnd > scheduleEnd) return false;
    return !input.blockers.some((booking) => {
      const blocksCandidate = booking.therapistId === candidate.id
        || booking.secondTherapistId === candidate.id;
      return blocksCandidate && overlaps(
        requestedStart,
        requestedEnd + PREPARATION_MINUTES,
        parseTimeMinutes(booking.startTime),
        parseTimeMinutes(booking.endTime) + PREPARATION_MINUTES,
      );
    });
  }) ?? null;
}

async function getAssignmentBooking(
  bookingType: AssignmentBookingType,
  bookingId: number,
): Promise<AssignmentBooking | null> {
  const db = await getDb();
  if (!db) return null;
  if (bookingType === "massage") {
    const [booking] = await db.select({
      id: massageBookings.id,
      clientName: massageBookings.clientName,
      bookingDate: massageBookings.bookingDate,
      startTime: massageBookings.startTime,
      endTime: massageBookings.endTime,
      duration: massageBookings.duration,
      status: massageBookings.status,
      techniqueId: massageBookings.techniqueId,
      therapistId: massageBookings.therapistId,
      techniqueName: massageTechniques.name,
    }).from(massageBookings)
      .leftJoin(massageTechniques, eq(massageBookings.techniqueId, massageTechniques.id))
      .where(eq(massageBookings.id, bookingId))
      .limit(1);
    if (!booking) return null;
    return {
      bookingType,
      bookingId,
      slotCount: 1,
      clientName: booking.clientName,
      serviceName: booking.techniqueName ?? "Masaje",
      bookingDate: serializeDate(booking.bookingDate),
      startTime: booking.startTime,
      endTime: booking.endTime,
      duration: booking.duration,
      status: booking.status,
      techniqueId: booking.techniqueId,
      therapistId: booking.therapistId,
      secondTherapistId: null,
    };
  }

  const [booking] = await db.select().from(massageProgramBookings)
    .where(eq(massageProgramBookings.id, bookingId))
    .limit(1);
  if (!booking) return null;
  return {
    bookingType,
    bookingId,
    slotCount: booking.modality === "double" ? 2 : 1,
    clientName: booking.secondClientName
      ? `${booking.clientName} / ${booking.secondClientName}`
      : booking.clientName,
    serviceName: `Programa ${booking.program.replaceAll("_", " ")}`,
    bookingDate: serializeDate(booking.bookingDate),
    startTime: booking.startTime,
    endTime: booking.endTime,
    duration: booking.duration,
    status: booking.status,
    techniqueId: null,
    therapistId: booking.therapistId,
    secondTherapistId: booking.secondTherapistId,
  };
}

async function loadCandidates(booking: AssignmentBooking): Promise<Candidate[]> {
  const db = await getDb();
  if (!db) return [];
  const fields = {
    id: massageTherapists.id,
    name: massageTherapists.name,
    phone: massageTherapists.phone,
    type: massageTherapists.type,
    callPriority: massageTherapists.callPriority,
    scheduleStart: massageTherapistAvailability.startTime,
    scheduleEnd: massageTherapistAvailability.endTime,
  };
  if (booking.bookingType === "massage" && booking.techniqueId) {
    const rows = await db.select(fields)
      .from(massageTherapistTechniques)
      .innerJoin(massageTherapists, eq(massageTherapistTechniques.therapistId, massageTherapists.id))
      .innerJoin(massageTherapistAvailability, eq(massageTherapistAvailability.therapistId, massageTherapists.id))
      .where(and(
        eq(massageTherapistTechniques.techniqueId, booking.techniqueId),
        eq(massageTherapists.active, 1),
        eq(massageTherapistAvailability.date, booking.bookingDate as any),
        eq(massageTherapistAvailability.isAvailable, 1),
      ));
    const candidates = rows
      .filter((row) => Boolean(row.scheduleStart && row.scheduleEnd))
      .map((row) => ({
        ...row,
        scheduleStart: row.scheduleStart!,
        scheduleEnd: row.scheduleEnd!,
      }));
    return filterFreelanceLeadTime(candidates, booking);
  }
  const rows = await db.select(fields)
    .from(massageTherapists)
    .innerJoin(massageTherapistAvailability, eq(massageTherapistAvailability.therapistId, massageTherapists.id))
    .where(and(
      eq(massageTherapists.active, 1),
      eq(massageTherapistAvailability.date, booking.bookingDate as any),
      eq(massageTherapistAvailability.isAvailable, 1),
    ));
  const candidates = rows
    .filter((row) => Boolean(row.scheduleStart && row.scheduleEnd))
    .map((row) => ({
      ...row,
      scheduleStart: row.scheduleStart!,
      scheduleEnd: row.scheduleEnd!,
    }));
  return filterFreelanceLeadTime(candidates, booking);
}

function filterFreelanceLeadTime(candidates: Candidate[], booking: AssignmentBooking) {
  const current = chileNow();
  if (booking.bookingDate !== current.date) return candidates;
  const leadMinutes = parseTimeMinutes(booking.startTime) - current.minutes;
  return candidates.filter((candidate) =>
    candidate.type === "inhouse" || leadMinutes >= 120,
  );
}

function scheduleAssignmentExpiration(
  requestId: number,
  expiresAt: Date,
) {
  const delay = Math.max(0, expiresAt.getTime() - Date.now());
  const timer = setTimeout(() => {
    void (async () => {
      const db = await getDb();
      if (!db) return;
      const [request] = await db.select().from(massageTherapistAssignmentRequests)
        .where(and(
          eq(massageTherapistAssignmentRequests.id, requestId),
          eq(massageTherapistAssignmentRequests.status, "pending"),
        ))
        .limit(1);
      if (request && isTherapistAssignmentExpired(request.expiresAt)) {
        await expireAndRotate(request);
      }
    })().catch((error) =>
      console.error("[TherapistAssignment] Vencimiento programado:", error),
    );
  }, delay);
  timer.unref();
}

async function loadBlockers(booking: AssignmentBooking): Promise<BlockingBooking[]> {
  const db = await getDb();
  if (!db) return [];
  const [standard, programs] = await Promise.all([
    db.select({
      id: massageBookings.id,
      therapistId: massageBookings.therapistId,
      startTime: massageBookings.startTime,
      endTime: massageBookings.endTime,
    }).from(massageBookings).where(and(
      eq(massageBookings.bookingDate, booking.bookingDate as any),
      sql`${massageBookings.status} NOT IN ('cancelled')`,
      ...(booking.bookingType === "massage" ? [ne(massageBookings.id, booking.bookingId)] : []),
    )),
    db.select({
      id: massageProgramBookings.id,
      therapistId: massageProgramBookings.therapistId,
      secondTherapistId: massageProgramBookings.secondTherapistId,
      startTime: massageProgramBookings.startTime,
      endTime: massageProgramBookings.endTime,
    }).from(massageProgramBookings).where(and(
      eq(massageProgramBookings.bookingDate, booking.bookingDate as any),
      sql`${massageProgramBookings.status} NOT IN ('cancelled')`,
      ...(booking.bookingType === "skedu_program" ? [ne(massageProgramBookings.id, booking.bookingId)] : []),
    )),
  ]);
  return [...standard, ...programs];
}

async function notifyNoCandidate(booking: AssignmentBooking, slotIndex: number) {
  await sendWhatsApp(
    TAMARA_MUNOZ_PHONE,
    `⚠️ *Sin terapeuta disponible* — Cancagua Spa\n\nNo quedan opciones disponibles para ${booking.serviceName}${booking.slotCount > 1 ? ` (terapeuta ${slotIndex})` : ""}.\n👤 ${booking.clientName}\n📅 ${humanDate(booking.bookingDate)}\n🕐 ${booking.startTime} – ${booking.endTime} hrs\n\nLa reserva quedó pendiente para revisión manual.`,
  ).catch((error) => console.error("[TherapistAssignment] WhatsApp sin candidato:", error));
}

async function offerNextTherapist(
  bookingType: AssignmentBookingType,
  bookingId: number,
  slotIndex: number,
  allowRetryPreferred = false,
): Promise<{ offered: boolean; therapistName?: string }> {
  const db = await getDb();
  if (!db) return { offered: false };
  const booking = await getAssignmentBooking(bookingType, bookingId);
  if (!booking || booking.status === "cancelled" || booking.status === "completed") {
    return { offered: false };
  }

  const attempts = await db.select({
    therapistId: massageTherapistAssignmentRequests.therapistId,
  }).from(massageTherapistAssignmentRequests).where(and(
    eq(massageTherapistAssignmentRequests.bookingType, bookingType),
    eq(massageTherapistAssignmentRequests.bookingId, bookingId),
    eq(massageTherapistAssignmentRequests.slotIndex, slotIndex),
  ));
  const attemptedTherapistIds = new Set(attempts.map((attempt) => attempt.therapistId));
  const preferredTherapistId = slotIndex === 2 ? booking.secondTherapistId : booking.therapistId;
  if (allowRetryPreferred && preferredTherapistId) {
    attemptedTherapistIds.delete(preferredTherapistId);
  }
  const excludedTherapistIds = new Set<number>();
  const otherTherapistId = slotIndex === 1 ? booking.secondTherapistId : booking.therapistId;
  if (otherTherapistId) excludedTherapistIds.add(otherTherapistId);

  const candidate = selectNextTherapistCandidate({
    candidates: await loadCandidates(booking),
    blockers: await loadBlockers(booking),
    attemptedTherapistIds,
    excludedTherapistIds,
    preferredTherapistId,
    startTime: booking.startTime,
    endTime: booking.endTime,
  });

  if (!candidate) {
    if (bookingType === "massage") {
      await db.update(massageBookings).set({
        therapistId: null,
        status: "pending",
        freelanceApprovalStatus: "assignment_exhausted",
        therapistConfirmationToken: null,
      }).where(eq(massageBookings.id, bookingId));
    } else {
      await db.update(massageProgramBookings).set({
        ...(slotIndex === 1 ? { therapistId: null } : { secondTherapistId: null }),
        status: "pending",
      })
        .where(eq(massageProgramBookings.id, bookingId));
    }
    await notifyNoCandidate(booking, slotIndex);
    return { offered: false };
  }

  await db.update(massageTherapistAssignmentRequests).set({
    status: "superseded",
    respondedAt: new Date(),
  }).where(and(
    eq(massageTherapistAssignmentRequests.bookingType, bookingType),
    eq(massageTherapistAssignmentRequests.bookingId, bookingId),
    eq(massageTherapistAssignmentRequests.slotIndex, slotIndex),
    eq(massageTherapistAssignmentRequests.status, "pending"),
  ));

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + THERAPIST_RESPONSE_WINDOW_MS);
  const [insertedRequest] = await db.insert(massageTherapistAssignmentRequests).values({
    bookingType,
    bookingId,
    slotIndex,
    therapistId: candidate.id,
    token,
    expiresAt,
    attemptNumber: attempts.length + 1,
  }).$returningId();
  scheduleAssignmentExpiration(insertedRequest.id, expiresAt);

  if (bookingType === "massage") {
    await db.update(massageBookings).set({
      therapistId: candidate.id,
      status: "pending",
      freelanceApprovalStatus: "awaiting_therapist",
      therapistConfirmationToken: token,
    }).where(eq(massageBookings.id, bookingId));
  } else {
    await db.update(massageProgramBookings).set({
      ...(slotIndex === 1
        ? { therapistId: candidate.id }
        : { secondTherapistId: candidate.id }),
      status: "pending",
    }).where(eq(massageProgramBookings.id, bookingId));
  }

  const actionUrl = `${ENV.appUrl}/api/masajes/freelance-confirmation?token=${token}`;
  const result = await sendWhatsApp(
    candidate.phone!,
    `📅 *Nueva reserva asignada* — Cancagua Spa\n\nHola ${candidate.name ?? "Terapeuta"}! ¿Puedes realizar este masaje?\n\n💆 ${booking.serviceName} · ${booking.duration} min\n👤 ${booking.clientName}\n📅 ${humanDate(booking.bookingDate)}\n🕐 ${booking.startTime} – ${booking.endTime} hrs\n\n⏳ Tienes 30 minutos para responder. Después de ese plazo el enlace expirará y se consultará automáticamente a otro terapeuta.\n\nResponde aquí 👉 ${actionUrl}`,
  );
  if (!result.success) {
    console.error("[TherapistAssignment] WhatsApp falló, rotando:", result.error);
    await db.update(massageTherapistAssignmentRequests).set({
      status: "rejected",
      respondedAt: new Date(),
    }).where(and(
      eq(massageTherapistAssignmentRequests.token, token),
      eq(massageTherapistAssignmentRequests.status, "pending"),
    ));
    return offerNextTherapist(bookingType, bookingId, slotIndex);
  }
  return { offered: true, therapistName: candidate.name ?? "Terapeuta" };
}

export async function startTherapistAssignmentForBooking(
  bookingType: AssignmentBookingType,
  bookingId: number,
  options: { force?: boolean } = {},
): Promise<void> {
  const booking = await getAssignmentBooking(bookingType, bookingId);
  if (!booking) return;
  const db = await getDb();
  if (!db) return;
  const pending = await db.select({ id: massageTherapistAssignmentRequests.id })
    .from(massageTherapistAssignmentRequests).where(and(
      eq(massageTherapistAssignmentRequests.bookingType, bookingType),
      eq(massageTherapistAssignmentRequests.bookingId, bookingId),
      eq(massageTherapistAssignmentRequests.status, "pending"),
    )).limit(1);
  if (!options.force && (pending.length > 0 || booking.status === "confirmed")) return;
  await db.update(massageTherapistAssignmentRequests).set({
    status: "superseded",
    respondedAt: new Date(),
  }).where(and(
    eq(massageTherapistAssignmentRequests.bookingType, bookingType),
    eq(massageTherapistAssignmentRequests.bookingId, bookingId),
    ...(options.force
      ? [inArray(massageTherapistAssignmentRequests.status, ["pending", "confirmed"])]
      : [eq(massageTherapistAssignmentRequests.status, "pending")]),
  ));
  if (bookingType === "massage") {
    await db.update(massageBookings).set({ status: "pending" })
      .where(eq(massageBookings.id, bookingId));
  } else {
    await db.update(massageProgramBookings).set({ status: "pending" })
      .where(eq(massageProgramBookings.id, bookingId));
  }
  for (let slotIndex = 1; slotIndex <= booking.slotCount; slotIndex += 1) {
    await offerNextTherapist(bookingType, bookingId, slotIndex, options.force);
  }
}

export async function stopTherapistAssignmentForBooking(
  bookingType: AssignmentBookingType,
  bookingId: number,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(massageTherapistAssignmentRequests).set({
    status: "superseded",
    respondedAt: new Date(),
  }).where(and(
    eq(massageTherapistAssignmentRequests.bookingType, bookingType),
    eq(massageTherapistAssignmentRequests.bookingId, bookingId),
    eq(massageTherapistAssignmentRequests.status, "pending"),
  ));
}

async function allRequiredSlotsConfirmed(booking: AssignmentBooking) {
  const db = await getDb();
  if (!db) return false;
  const confirmed = await db.select({
    slotIndex: massageTherapistAssignmentRequests.slotIndex,
  }).from(massageTherapistAssignmentRequests).where(and(
    eq(massageTherapistAssignmentRequests.bookingType, booking.bookingType),
    eq(massageTherapistAssignmentRequests.bookingId, booking.bookingId),
    eq(massageTherapistAssignmentRequests.status, "confirmed"),
  ));
  return new Set(confirmed.map((request) => request.slotIndex)).size >= booking.slotCount;
}

async function expireAndRotate(request: typeof massageTherapistAssignmentRequests.$inferSelect) {
  const db = await getDb();
  if (!db) return false;
  const claim = await db.update(massageTherapistAssignmentRequests).set({
    status: "expired",
    respondedAt: new Date(),
  }).where(and(
    eq(massageTherapistAssignmentRequests.id, request.id),
    eq(massageTherapistAssignmentRequests.status, "pending"),
  ));
  if (affectedRows(claim) !== 1) return false;
  await offerNextTherapist(request.bookingType, request.bookingId, request.slotIndex);
  return true;
}

export async function getTherapistAssignmentRequestView(
  token: string,
  now = new Date(),
): Promise<AssignmentRequestView> {
  const db = await getDb();
  if (!db || !token) return { state: "invalid" };
  const [request] = await db.select({
    request: massageTherapistAssignmentRequests,
    therapistName: massageTherapists.name,
  }).from(massageTherapistAssignmentRequests)
    .leftJoin(massageTherapists, eq(massageTherapistAssignmentRequests.therapistId, massageTherapists.id))
    .where(eq(massageTherapistAssignmentRequests.token, token))
    .limit(1);
  if (!request) return { state: "invalid" };
  const booking = await getAssignmentBooking(request.request.bookingType, request.request.bookingId);
  if (!booking) return { state: "invalid" };
  if (["cancelled", "completed", "no_show"].includes(booking.status)) {
    await stopTherapistAssignmentForBooking(request.request.bookingType, request.request.bookingId);
    return { state: "processed" };
  }
  if (request.request.status === "pending" && isTherapistAssignmentExpired(request.request.expiresAt, now)) {
    await expireAndRotate(request.request);
    return { state: "expired" };
  }
  const state = request.request.status === "pending"
    ? "pending"
    : request.request.status === "confirmed"
      ? "confirmed"
      : request.request.status === "rejected"
        ? "rejected"
        : request.request.status === "expired"
          ? "expired"
          : "processed";
  return {
    state,
    therapistName: request.therapistName ?? "Terapeuta",
    clientName: booking.clientName,
    serviceName: booking.serviceName,
    bookingDate: booking.bookingDate,
    startTime: booking.startTime,
    endTime: booking.endTime,
    expiresAt: request.request.expiresAt,
  };
}

export async function respondToTherapistAssignment(
  token: string,
  action: AssignmentAction,
  now = new Date(),
): Promise<AssignmentRequestView> {
  const db = await getDb();
  if (!db || !token) return { state: "invalid" };
  const [request] = await db.select().from(massageTherapistAssignmentRequests)
    .where(eq(massageTherapistAssignmentRequests.token, token))
    .limit(1);
  if (!request) return { state: "invalid" };
  if (request.status !== "pending") return getTherapistAssignmentRequestView(token, now);
  const booking = await getAssignmentBooking(request.bookingType, request.bookingId);
  if (!booking) return { state: "invalid" };
  if (["cancelled", "completed", "no_show"].includes(booking.status)) {
    await stopTherapistAssignmentForBooking(request.bookingType, request.bookingId);
    return { state: "processed" };
  }
  if (isTherapistAssignmentExpired(request.expiresAt, now)) {
    await expireAndRotate(request);
    return { state: "expired" };
  }

  const nextStatus = action === "confirm" ? "confirmed" : "rejected";
  const claim = await db.update(massageTherapistAssignmentRequests).set({
    status: nextStatus,
    respondedAt: now,
  }).where(and(
    eq(massageTherapistAssignmentRequests.id, request.id),
    eq(massageTherapistAssignmentRequests.status, "pending"),
  ));
  if (affectedRows(claim) !== 1) return getTherapistAssignmentRequestView(token, now);

  if (action === "reject") {
    await offerNextTherapist(request.bookingType, request.bookingId, request.slotIndex);
    return { ...(await getTherapistAssignmentRequestView(token, now)), state: "rejected" };
  }

  if (await allRequiredSlotsConfirmed(booking)) {
    if (request.bookingType === "massage") {
      await db.update(massageBookings).set({
        status: "confirmed",
        freelanceApprovalStatus: "therapist_confirmed",
        therapistConfirmationToken: null,
      }).where(eq(massageBookings.id, request.bookingId));
    } else {
      await db.update(massageProgramBookings).set({ status: "confirmed" })
        .where(eq(massageProgramBookings.id, request.bookingId));
    }
    await sendWhatsApp(
      TAMARA_MUNOZ_PHONE,
      `✅ *Asignación confirmada* — Cancagua Spa\n\n${booking.serviceName}\n👤 ${booking.clientName}\n📅 ${humanDate(booking.bookingDate)} · ${booking.startTime} hrs\n\nTodos los terapeutas requeridos confirmaron.`,
    ).catch((error) => console.error("[TherapistAssignment] WhatsApp confirmación:", error));
  }
  return { ...(await getTherapistAssignmentRequestView(token, now)), state: "confirmed" };
}

export async function processExpiredTherapistAssignments(now = new Date()) {
  const db = await getDb();
  if (!db) return { processed: 0 };
  const expired = await db.select().from(massageTherapistAssignmentRequests).where(and(
    eq(massageTherapistAssignmentRequests.status, "pending"),
    lte(massageTherapistAssignmentRequests.expiresAt, now),
  )).orderBy(asc(massageTherapistAssignmentRequests.expiresAt)).limit(100);
  let processed = 0;
  for (const request of expired) {
    if (await expireAndRotate(request)) processed += 1;
  }
  return { processed };
}

export function startTherapistAssignmentExpiryWorker() {
  void processExpiredTherapistAssignments().catch((error) =>
    console.error("[TherapistAssignment] Barrido inicial:", error),
  );
  const timer = setInterval(() => {
    void processExpiredTherapistAssignments().catch((error) =>
      console.error("[TherapistAssignment] Barrido de vencimientos:", error),
    );
  }, 60_000);
  timer.unref();
  return timer;
}
