import { and, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import {
  biopoolBookingActivity,
  biopoolBookings,
  biopoolNotifications,
  biopoolServices,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { sendWhatsApp } from "./_core/whapi";
import { getDb } from "./db";
import { sendEmail } from "./email";

const POLL_MS = 60_000;
const RETRY_DELAY_MS = 15 * 60_000;

function serializeDate(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function formatDate(value: unknown): string {
  const date = serializeDate(value);
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderBiopoolTemplate(
  template: string,
  booking: typeof biopoolBookings.$inferSelect,
  service: typeof biopoolServices.$inferSelect
): string {
  const origin = (ENV.appUrl || "https://cms.cancagua.cl").replace(/\/$/, "");
  const variables: Record<string, string> = {
    firstName: booking.clientName.trim().split(/\s+/)[0] || "Hola",
    clientName: booking.clientName,
    bookingCode: booking.bookingCode,
    serviceName: service.name,
    date: formatDate(booking.bookingDate),
    startTime: booking.startTime,
    endTime: booking.endTime,
    adultQuantity: String(booking.adultQuantity),
    childQuantity: String(booking.childQuantity),
    totalGuests: String(booking.totalGuests),
    mapsUrl:
      service.mapsUrl ||
      "https://www.google.com/maps/search/?api=1&query=Cancagua+Spa+Frutillar",
    rulesUrl: service.rulesUrl || "",
    confirmUrl: `${origin}/biopiscinas/confirmar/${booking.attendanceToken}`,
  };
  return template.replace(
    /{{(\w+)}}/g,
    (_match, key: string) => variables[key] ?? ""
  );
}

async function claimNotification(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const staleAt = new Date(Date.now() - RETRY_DELAY_MS);
  const result = await db.execute(sql`
    UPDATE biopool_notifications
       SET status = 'sending', attempt_count = attempt_count + 1, updated_at = NOW()
     WHERE id = ${id}
       AND attempt_count < 3
       AND (status IN ('pending','failed') OR (status = 'sending' AND updated_at < ${staleAt}))
  `);
  return (
    Number(
      (result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0
    ) === 1
  );
}

export async function processBiopoolNotificationQueue(
  now = new Date()
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const staleAt = new Date(now.getTime() - RETRY_DELAY_MS);
  const queue = await db
    .select({
      notification: biopoolNotifications,
      booking: biopoolBookings,
      service: biopoolServices,
    })
    .from(biopoolNotifications)
    .innerJoin(
      biopoolBookings,
      eq(biopoolNotifications.bookingId, biopoolBookings.id)
    )
    .innerJoin(
      biopoolServices,
      eq(biopoolBookings.serviceId, biopoolServices.id)
    )
    .where(
      and(
        or(
          inArray(biopoolNotifications.status, ["pending", "failed"]),
          and(
            eq(biopoolNotifications.status, "sending"),
            lte(biopoolNotifications.updatedAt, staleAt)
          )
        ),
        lt(biopoolNotifications.attemptCount, 3),
        lte(biopoolNotifications.scheduledAt, now),
        inArray(biopoolBookings.status, ["pending", "confirmed"])
      )
    )
    .limit(30);

  for (const item of queue) {
    if (!(await claimNotification(item.notification.id))) continue;
    try {
      const isReminder = item.notification.type === "reminder";
      const template = isReminder
        ? item.notification.channel === "whatsapp"
          ? item.service.reminderWhatsappBody
          : item.service.reminderEmailBody
        : item.service.confirmationEmailBody;
      const message = renderBiopoolTemplate(
        template || "",
        item.booking,
        item.service
      );
      const result =
        item.notification.channel === "whatsapp"
          ? await sendWhatsApp(item.booking.clientPhone, message)
          : await sendEmail({
              to: item.booking.clientEmail,
              subject: isReminder
                ? item.service.reminderEmailSubject ||
                  "Recordatorio de tu reserva en Cancagua"
                : item.service.confirmationEmailSubject ||
                  "Confirmación de tu reserva en Cancagua",
              html: `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;line-height:1.6;color:#292524"><h1 style="font-size:24px">Cancagua</h1><p>${escapeHtml(message).replace(/\n/g, "<br>")}</p></div>`,
              text: message,
              senderName: "Cancagua",
              fromEmail: item.service.notificationEmail,
              replyTo: item.service.notificationEmail,
            });
      await db
        .update(biopoolNotifications)
        .set(
          result.success
            ? {
                status: "sent",
                sentAt: new Date(),
                providerId: "id" in result ? (result.id ?? null) : null,
                error: null,
              }
            : {
                status: "failed",
                scheduledAt: new Date(Date.now() + RETRY_DELAY_MS),
                error: result.error?.slice(0, 2000) || "Error desconocido",
              }
        )
        .where(eq(biopoolNotifications.id, item.notification.id));
      await db.insert(biopoolBookingActivity).values({
        bookingId: item.booking.id,
        action: `${item.notification.type}_${item.notification.channel}_${result.success ? "sent" : "failed"}`,
        detail: result.success ? null : JSON.stringify({ error: result.error }),
      });
    } catch (error) {
      await db
        .update(biopoolNotifications)
        .set({
          status: "failed",
          scheduledAt: new Date(Date.now() + RETRY_DELAY_MS),
          error: String(error).slice(0, 2000),
        })
        .where(eq(biopoolNotifications.id, item.notification.id));
    }
  }
}

let started = false;
export function startBiopoolNotificationScheduler(): void {
  if (started || process.env.NODE_ENV === "test") return;
  started = true;
  void processBiopoolNotificationQueue();
  const timer = setInterval(
    () => void processBiopoolNotificationQueue(),
    POLL_MS
  );
  timer.unref?.();
}
