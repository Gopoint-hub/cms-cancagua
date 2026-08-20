import { and, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import {
  saunaBookings,
  saunaNotifications,
  saunaSettings,
} from "../drizzle/schema";
import { sendWhatsApp } from "./_core/whapi";
import { getDb } from "./db";
import { sendEmail } from "./email";

const POLL_MS = 60_000;
const RETRY_DELAY_MS = 15 * 60_000;
const MAPS_URL =
  "https://www.google.com/maps/search/?api=1&query=Cancagua+Spa+Frutillar";

type SaunaBooking = typeof saunaBookings.$inferSelect;
type SaunaSettings = typeof saunaSettings.$inferSelect;

// Se encola una confirmación por canal. La cola es lo que permite reintentar sin
// volver a cobrar: si Resend o Whapi están caídos, la reserva ya quedó pagada y
// el aviso sale cuando el proveedor vuelve.
export function buildSaunaNotificationSchedule(input: {
  bookingId: number;
  confirmationAt?: Date;
  confirmationEmailEnabled?: boolean;
}): Array<typeof saunaNotifications.$inferInsert> {
  const confirmationAt = input.confirmationAt ?? new Date();
  return [
    ...(input.confirmationEmailEnabled === false ? [] : [{
      bookingId: input.bookingId,
      type: "confirmation" as const,
      channel: "email" as const,
      scheduledAt: confirmationAt,
    }]),
    {
      bookingId: input.bookingId,
      type: "confirmation",
      channel: "whatsapp",
      scheduledAt: confirmationAt,
    },
  ];
}

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

export function renderSaunaTemplate(
  template: string,
  booking: SaunaBooking
): string {
  const clientName = booking.clientName ?? "";
  const variables: Record<string, string> = {
    firstName: clientName.trim().split(/\s+/)[0] || "Hola",
    clientName,
    bookingCode: booking.bookingCode,
    serviceName: booking.serviceName,
    date: formatDate(booking.bookingDate),
    startTime: booking.startTime,
    endTime: booking.endTime,
    guests: String(booking.guests),
    mapsUrl: MAPS_URL,
  };
  return template.replace(
    /{{(\w+)}}/g,
    (_match, key: string) => variables[key] ?? ""
  );
}

export function saunaStaffRecipient(config: SaunaSettings | undefined): string {
  return (
    process.env.SAUNA_STAFF_EMAIL?.trim() ||
    config?.notificationEmail?.trim() ||
    "contacto@cancagua.cl"
  );
}

// Copia interna: la confirmación al cliente no le avisa a recepción, así que una
// reserva de sauna podía entrar sin que nadie en el local se enterara.
export async function sendSaunaStaffConfirmation(
  booking: SaunaBooking,
  config: SaunaSettings | undefined
): Promise<{ success: boolean; error?: string }> {
  const to = saunaStaffRecipient(config);
  if (!to) return { success: false, error: "Sin destinatario de recepción" };

  const rows: [string, string][] = [
    ["Código", booking.bookingCode],
    ["Servicio", booking.serviceName],
    ["Fecha", formatDate(booking.bookingDate)],
    ["Hora", `${booking.startTime} a ${booking.endTime}`],
    ["Personas", String(booking.guests)],
    ["Aforo", booking.isPrivate ? "Privado" : "Compartido"],
    ["Cliente", booking.clientName ?? "—"],
    ["Correo", booking.clientEmail ?? "—"],
    ["Teléfono", booking.clientPhone ?? "—"],
    [
      "Pagado",
      `$${Number(booking.amountPaidClp ?? 0).toLocaleString("es-CL")}`,
    ],
  ];
  const html = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;line-height:1.6;color:#292524">
    <h1 style="font-size:22px">Nueva reserva de Sauna</h1>
    <table style="border-collapse:collapse">${rows
      .map(
        ([label, value]) =>
          `<tr><td style="padding:4px 12px 4px 0"><strong>${escapeHtml(label)}</strong></td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`
      )
      .join("")}</table>
  </div>`;
  return sendEmail({
    to,
    subject: `Reserva de Sauna ingresada — ${booking.bookingCode}`,
    html,
  });
}

async function claimNotification(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const staleAt = new Date(Date.now() - RETRY_DELAY_MS);
  const result = await db.execute(sql`
    UPDATE sauna_notifications
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

export async function processSaunaNotificationQueue(
  now = new Date()
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const staleAt = new Date(now.getTime() - RETRY_DELAY_MS);
  const queue = await db
    .select({ notification: saunaNotifications, booking: saunaBookings })
    .from(saunaNotifications)
    .innerJoin(
      saunaBookings,
      eq(saunaNotifications.bookingId, saunaBookings.id)
    )
    .where(
      and(
        or(
          inArray(saunaNotifications.status, ["pending", "failed"]),
          and(
            eq(saunaNotifications.status, "sending"),
            lte(saunaNotifications.updatedAt, staleAt)
          )
        ),
        lt(saunaNotifications.attemptCount, 3),
        lte(saunaNotifications.scheduledAt, now),
        inArray(saunaBookings.status, ["pending", "confirmed"])
      )
    )
    .limit(30);
  if (queue.length === 0) return;

  const [config] = await db
    .select()
    .from(saunaSettings)
    .where(eq(saunaSettings.id, 1))
    .limit(1);

  for (const item of queue) {
    if (!(await claimNotification(item.notification.id))) continue;
    try {
      const isWhatsapp = item.notification.channel === "whatsapp";
      const template = isWhatsapp
        ? config?.confirmationWhatsappBody
        : config?.confirmationEmailBody;
      if (!template) {
        await db
          .update(saunaNotifications)
          .set({ status: "skipped", error: "Sin plantilla configurada" })
          .where(eq(saunaNotifications.id, item.notification.id));
        continue;
      }
      const destination = isWhatsapp
        ? item.booking.clientPhone
        : item.booking.clientEmail;
      if (!destination) {
        await db
          .update(saunaNotifications)
          .set({ status: "skipped", error: "La reserva no tiene ese dato de contacto" })
          .where(eq(saunaNotifications.id, item.notification.id));
        continue;
      }
      const message = renderSaunaTemplate(template, item.booking);
      const result = isWhatsapp
        ? await sendWhatsApp(destination, message)
        : await sendEmail({
            to: destination,
            subject:
              config?.confirmationEmailSubject ||
              "Confirmación de tu reserva de Sauna — Cancagua",
            html: `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;line-height:1.6;color:#292524"><h1 style="font-size:24px">Cancagua</h1><p>${escapeHtml(message).replace(/\n/g, "<br>")}</p></div>`,
          });
      await db
        .update(saunaNotifications)
        .set(
          result.success
            ? {
                status: "sent",
                sentAt: new Date(),
                providerId: (result as any).id ?? null,
                error: null,
              }
            : {
                status: "failed",
                scheduledAt: new Date(Date.now() + RETRY_DELAY_MS),
                error: result.error?.slice(0, 2000) || "Error desconocido",
              }
        )
        .where(eq(saunaNotifications.id, item.notification.id));

      // La copia a recepción va pegada al correo de confirmación: si ese no
      // salió, la reserva se sigue reintentando y no corresponde avisar dos veces.
      if (result.success && !isWhatsapp) {
        const staff = await sendSaunaStaffConfirmation(item.booking, config);
        if (!staff.success) {
          console.error(
            "[sauna:notificaciones] Confirmación enviada al cliente; falló la copia a recepción",
            { bookingId: item.booking.id, error: staff.error }
          );
        }
      }
    } catch (error) {
      await db
        .update(saunaNotifications)
        .set({
          status: "failed",
          scheduledAt: new Date(Date.now() + RETRY_DELAY_MS),
          error: String(error).slice(0, 2000),
        })
        .where(eq(saunaNotifications.id, item.notification.id));
    }
  }
}

let started = false;
export function startSaunaNotificationScheduler(): void {
  if (started || process.env.NODE_ENV === "test") return;
  started = true;
  void processSaunaNotificationQueue();
  const timer = setInterval(() => void processSaunaNotificationQueue(), POLL_MS);
  timer.unref?.();
}
