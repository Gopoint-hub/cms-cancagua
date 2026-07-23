import { randomBytes } from "node:crypto";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  massageBookings,
  massageNpsResponses,
  massageProgramBookings,
  massageTechniques,
} from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";
import { sendWhatsApp } from "./_core/whapi";

const CHILE_TIME_ZONE = "America/Santiago";
const NPS_DELAY_MS = 30 * 60 * 1000;
const MAX_OVERDUE_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 15 * 60 * 1000;
const POLL_MS = 60 * 1000;

const chileDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CHILE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getChileDate(now = new Date()): string {
  const parts = Object.fromEntries(
    chileDateFormatter.formatToParts(now).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function serializeDate(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
  }
  return String(value).slice(0, 10);
}

function getChileOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHILE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const representedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return representedAsUtc - at.getTime();
}

export function chileLocalDateTimeToUtc(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = new Date(naiveUtc);
  candidate = new Date(naiveUtc - getChileOffsetMs(candidate));
  candidate = new Date(naiveUtc - getChileOffsetMs(candidate));
  return candidate;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function surveyUrl(token: string): string {
  const origin = (ENV.appUrl || "https://cms.cancagua.cl").replace(/\/$/, "");
  return `${origin}/nps/masajes/${token}`;
}

function buildNpsMessage(clientName: string, serviceName: string, token: string): string {
  const firstName = clientName.trim().split(/\s+/)[0] || "Hola";
  return `Hola ${firstName} 😊 Esperamos que hayas disfrutado tu experiencia en Cancagua Spa.\n\nDel 0 al 10, ¿qué tan probable es que nos recomiendes?\n\nResponde aquí: ${surveyUrl(token)}\n\nTe tomará menos de un minuto. ¡Gracias por ayudarnos a mejorar!`;
}

type Candidate = {
  bookingType: "massage" | "skedu_program";
  bookingId: number;
  serviceName: string;
  clientName: string;
  clientPhone: string;
  serviceDate: string;
  endTime: string;
};

async function findCandidates(): Promise<Candidate[]> {
  const db = await getDb();
  if (!db) return [];
  const today = getChileDate();
  const yesterday = addDays(today, -1);

  const [massages, programs] = await Promise.all([
    db.select({
      bookingId: massageBookings.id,
      serviceName: massageTechniques.name,
      clientName: massageBookings.clientName,
      clientPhone: massageBookings.clientPhone,
      serviceDate: massageBookings.bookingDate,
      endTime: massageBookings.endTime,
    })
      .from(massageBookings)
      .leftJoin(massageTechniques, eq(massageBookings.techniqueId, massageTechniques.id))
      .where(and(
        gte(massageBookings.bookingDate, yesterday as any),
        lte(massageBookings.bookingDate, today as any),
        inArray(massageBookings.status, ["confirmed", "completed"]),
        sql`${massageBookings.clientPhone} IS NOT NULL AND TRIM(${massageBookings.clientPhone}) <> ''`,
      )),
    db.select({
      bookingId: massageProgramBookings.id,
      serviceName: massageProgramBookings.program,
      clientName: massageProgramBookings.clientName,
      clientPhone: massageProgramBookings.clientPhone,
      serviceDate: massageProgramBookings.bookingDate,
      endTime: massageProgramBookings.endTime,
    })
      .from(massageProgramBookings)
      .where(and(
        gte(massageProgramBookings.bookingDate, yesterday as any),
        lte(massageProgramBookings.bookingDate, today as any),
        inArray(massageProgramBookings.status, ["confirmed", "completed"]),
        sql`${massageProgramBookings.clientPhone} IS NOT NULL AND TRIM(${massageProgramBookings.clientPhone}) <> ''`,
      )),
  ]);

  return [
    ...massages.map((row) => ({
      bookingType: "massage" as const,
      bookingId: row.bookingId,
      serviceName: row.serviceName ?? "Masaje",
      clientName: row.clientName,
      clientPhone: row.clientPhone!,
      serviceDate: serializeDate(row.serviceDate),
      endTime: row.endTime,
    })),
    ...programs.map((row) => ({
      bookingType: "skedu_program" as const,
      bookingId: row.bookingId,
      serviceName: `Programa ${row.serviceName.replaceAll("_", " ")}`,
      clientName: row.clientName,
      clientPhone: row.clientPhone!,
      serviceDate: serializeDate(row.serviceDate),
      endTime: row.endTime,
    })),
  ];
}

async function createAndSend(candidate: Candidate, now: Date): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const scheduledSendAt = new Date(
    chileLocalDateTimeToUtc(candidate.serviceDate, candidate.endTime).getTime() + NPS_DELAY_MS,
  );
  const overdue = now.getTime() - scheduledSendAt.getTime();
  if (overdue < 0 || overdue > MAX_OVERDUE_MS) return;

  const token = randomBytes(24).toString("hex");
  await db.insert(massageNpsResponses).values({
    ...candidate,
    serviceDate: candidate.serviceDate as any,
    surveyToken: token,
    scheduledSendAt,
  }).onDuplicateKeyUpdate({ set: { serviceName: candidate.serviceName } });

  const [survey] = await db.select().from(massageNpsResponses).where(and(
    eq(massageNpsResponses.bookingType, candidate.bookingType),
    eq(massageNpsResponses.bookingId, candidate.bookingId),
  )).limit(1);
  if (!survey || survey.deliveryStatus === "sent" || survey.deliveryStatus === "skipped") return;
  if (survey.attemptCount >= 3) return;
  if (survey.lastAttemptAt && now.getTime() - survey.lastAttemptAt.getTime() < RETRY_AFTER_MS) return;

  const staleSendingBefore = new Date(now.getTime() - RETRY_AFTER_MS);
  const claimResult = await db.execute(sql`
    UPDATE massage_nps_responses
    SET delivery_status = 'sending',
        attempt_count = attempt_count + 1,
        last_attempt_at = ${now}
    WHERE id = ${survey.id}
      AND (
        delivery_status IN ('pending', 'failed')
        OR (delivery_status = 'sending' AND last_attempt_at < ${staleSendingBefore})
      )
  `);
  const affectedRows = Number((claimResult as any)?.[0]?.affectedRows ?? (claimResult as any)?.affectedRows ?? 0);
  if (affectedRows !== 1) return;

  const result = await sendWhatsApp(
    candidate.clientPhone,
    buildNpsMessage(candidate.clientName, candidate.serviceName, survey.surveyToken),
  );
  await db.update(massageNpsResponses).set(result.success
    ? { deliveryStatus: "sent", sentAt: new Date(), deliveryError: null }
    : { deliveryStatus: "failed", deliveryError: result.error?.slice(0, 2000) ?? "Error desconocido" }
  ).where(eq(massageNpsResponses.id, survey.id));
}

export async function processMassageNpsQueue(now = new Date()): Promise<void> {
  const candidates = await findCandidates();
  for (const candidate of candidates) {
    try {
      await createAndSend(candidate, now);
    } catch (error) {
      console.error(`[NPS] No se pudo procesar ${candidate.bookingType} #${candidate.bookingId}:`, error);
    }
  }
}

let schedulerStarted = false;

export function startMassageNpsScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;
  void processMassageNpsQueue();
  const timer = setInterval(() => void processMassageNpsQueue(), POLL_MS);
  timer.unref();
  console.log("[NPS] Programador de encuestas de masajes activo");
}
