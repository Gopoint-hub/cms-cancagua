import { and, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import {
  biopoolBookings,
  biopoolCheckoutOrders,
  saunaBookings,
  saunaCheckoutOrders,
  serviceCartCheckoutItems,
  serviceCartCheckoutOrders,
  serviceCartNotifications,
} from "../drizzle/schema";
import { getDb } from "./db";
import { sendEmail } from "./email";

const POLL_MS = 60_000;
const RETRY_DELAY_MS = 15 * 60_000;
const MAPS_URL = "https://www.google.com/maps/search/?api=1&query=Cancagua+Spa+Frutillar";

export type ConsolidatedCartEmailItem = {
  module: "biopools" | "sauna" | "massages" | "regular_classes";
  itemName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  guests: number;
  bookingCode?: string | null;
};

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function serviceAdvice(module: ConsolidatedCartEmailItem["module"]) {
  if (module === "sauna") {
    return [
      "Llega 15 minutos antes para registrarte y prepararte con calma.",
      "Trae traje de baño e hidratación.",
      "Puedes arrendar bata y toalla en recepción.",
    ];
  }
  if (module === "massages") {
    return [
      "Llega 10 minutos antes para realizar tu check-in.",
      "Coméntale a tu terapeuta cualquier lesión, alergia o condición relevante.",
      "Si necesitas reagendar, contáctanos con la anticipación indicada en las condiciones de compra.",
    ];
  }
  if (module === "regular_classes") {
    return [
      "Tu plan quedó activo para el período informado.",
      "Coordina tus asistencias con nuestro equipo según los cupos disponibles.",
      "Trae ropa cómoda e hidratación.",
    ];
  }
  return [
    "Trae traje de baño, gorra de baño e hidratación.",
    "No uses bloqueador antes de entrar al agua; ayuda a cuidar el ecosistema de las biopiscinas.",
    "Los niños deben permanecer acompañados por una persona adulta.",
    "Puedes arrendar bata, toalla y locker en recepción.",
  ];
}

export function buildServiceCartConfirmationEmail(input: {
  clientName: string;
  items: ConsolidatedCartEmailItem[];
  totalClp: number;
}) {
  const firstName = input.clientName.trim().split(/\s+/)[0] || "Hola";
  const serviceRows = input.items.map((item) => {
    const details = item.module === "regular_classes" ? [
      ["Inicio del plan", formatDate(item.bookingDate)],
      ["Personas", String(item.guests)],
    ] : [
      ["Fecha", formatDate(item.bookingDate)],
      ["Horario", `${item.startTime} a ${item.endTime}`],
      ["Personas", String(item.guests)],
      ...(item.bookingCode ? [["Código de reserva", item.bookingCode]] : []),
    ];
    const moduleLabel = item.module === "biopools" ? "Biopiscinas" : item.module === "sauna" ? "Sauna" : item.module === "massages" ? "Masaje" : "Clases Regulares";
    return `<tr><td style="padding:0 28px 22px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #D7D4D1;border-radius:16px;background:#FCF9F9"><tr><td style="padding:24px"><p style="margin:0 0 6px;font:11px Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:#696F4D">${moduleLabel}</p><h2 style="margin:0 0 18px;font:normal 25px Georgia,serif;color:#222221">${escapeHtml(item.itemName)}</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${details.map(([label, value]) => `<tr><td style="padding:5px 12px 5px 0;font:13px Arial,sans-serif;color:#827D78">${escapeHtml(label)}</td><td style="padding:5px 0;font:bold 13px Arial,sans-serif;color:#333D51">${escapeHtml(value)}</td></tr>`).join("")}</table><div style="margin-top:18px;padding-top:16px;border-top:1px solid #E8E4DD"><p style="margin:0 0 8px;font:bold 13px Arial,sans-serif;color:#333D51">Para disfrutar esta experiencia</p><ul style="margin:0;padding-left:18px;font:13px/1.6 Arial,sans-serif;color:#635E5A">${serviceAdvice(item.module).map((advice) => `<li>${escapeHtml(advice)}</li>`).join("")}</ul></div></td></tr></table></td></tr>`;
  }).join("");

  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#F4F2ED"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F2ED"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:20px;overflow:hidden"><tr><td style="padding:30px 28px;background:#1B212D;text-align:center"><img src="https://cancagua.cl/brand/logos/cancagua-wordmark-medium-white.png" width="180" alt="Cancagua" style="display:inline-block;max-width:180px;height:auto"></td></tr><tr><td style="padding:34px 28px 24px"><p style="margin:0 0 10px;font:12px Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:#696F4D">Compra confirmada</p><h1 style="margin:0;font:normal 34px/1.15 Georgia,serif;color:#222221">${escapeHtml(firstName)}, tus experiencias están reservadas.</h1><p style="margin:18px 0 0;font:15px/1.65 Arial,sans-serif;color:#635E5A">Recibimos tu pago y confirmamos todos los servicios de tu carrito. Aquí encontrarás cada horario y lo necesario para prepararte.</p></td></tr>${serviceRows}<tr><td style="padding:2px 28px 26px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#E9E4D8;border-radius:14px"><tr><td style="padding:19px 22px;font:14px Arial,sans-serif;color:#333D51">Total pagado</td><td align="right" style="padding:19px 22px;font:bold 18px Arial,sans-serif;color:#222221">$${input.totalClp.toLocaleString("es-CL")}</td></tr></table></td></tr><tr><td style="padding:0 28px 32px"><h2 style="margin:0 0 10px;font:normal 22px Georgia,serif;color:#222221">Información común para tu visita</h2><p style="margin:0 0 18px;font:14px/1.65 Arial,sans-serif;color:#635E5A">Preséntate en recepción al llegar. Si necesitas ayuda con cualquiera de tus reservas, responde este correo o escríbenos a contacto@cancagua.cl.</p><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="border-radius:999px;background:#333D51"><a href="${MAPS_URL}" style="display:inline-block;padding:13px 22px;font:bold 12px Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;text-decoration:none;color:#FFFFFF">Cómo llegar</a></td></tr></table></td></tr><tr><td style="padding:22px 28px;background:#333D51;text-align:center;font:12px/1.6 Arial,sans-serif;color:#CCD1DB">Cancagua · Frutillar, Región de Los Lagos<br>Este correo reúne todos los servicios de una misma compra.</td></tr></table></td></tr></table></body></html>`;

  const textItems = input.items.map((item) => `${item.itemName}\n${item.module === "regular_classes" ? `Inicio del plan: ${formatDate(item.bookingDate)}` : `Fecha: ${formatDate(item.bookingDate)}\nHorario: ${item.startTime} a ${item.endTime}`}\nPersonas: ${item.guests}${item.bookingCode ? `\nCódigo de reserva: ${item.bookingCode}` : ""}\n${serviceAdvice(item.module).map((advice) => `- ${advice}`).join("\n")}`).join("\n\n");
  const text = `${firstName}, tus experiencias están reservadas.\n\n${textItems}\n\nTotal pagado: $${input.totalClp.toLocaleString("es-CL")}\n\nPreséntate en recepción al llegar. Cómo llegar: ${MAPS_URL}\nAyuda: contacto@cancagua.cl`;
  return { subject: "Confirmación de tus experiencias en Cancagua", html, text };
}

async function claimNotification(id: number) {
  const db = await getDb();
  if (!db) return false;
  const staleAt = new Date(Date.now() - RETRY_DELAY_MS);
  const result = await db.execute(sql`
    UPDATE service_cart_notifications
       SET status = 'sending', attempt_count = attempt_count + 1, updated_at = NOW()
     WHERE id = ${id}
       AND attempt_count < 3
       AND (status IN ('pending','failed') OR (status = 'sending' AND updated_at < ${staleAt}))
  `);
  return Number((result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0) === 1;
}

async function bookingCode(db: Awaited<ReturnType<typeof getDb>>, item: typeof serviceCartCheckoutItems.$inferSelect) {
  if (!db) return null;
  if (item.module === "biopools") {
    const [row] = await db.select({ code: biopoolBookings.bookingCode }).from(biopoolCheckoutOrders).innerJoin(biopoolBookings, eq(biopoolCheckoutOrders.bookingId, biopoolBookings.id)).where(eq(biopoolCheckoutOrders.id, item.childOrderId)).limit(1);
    return row?.code ?? null;
  }
  if (item.module !== "sauna") return null;
  const [row] = await db.select({ code: saunaBookings.bookingCode }).from(saunaCheckoutOrders).innerJoin(saunaBookings, eq(saunaCheckoutOrders.bookingId, saunaBookings.id)).where(eq(saunaCheckoutOrders.id, item.childOrderId)).limit(1);
  return row?.code ?? null;
}

export async function processServiceCartNotificationQueue(now = new Date()) {
  const db = await getDb();
  if (!db) return;
  const staleAt = new Date(now.getTime() - RETRY_DELAY_MS);
  const queue = await db.select({ notification: serviceCartNotifications, order: serviceCartCheckoutOrders }).from(serviceCartNotifications).innerJoin(serviceCartCheckoutOrders, eq(serviceCartNotifications.cartOrderId, serviceCartCheckoutOrders.id)).where(and(or(inArray(serviceCartNotifications.status, ["pending", "failed"]), and(eq(serviceCartNotifications.status, "sending"), lte(serviceCartNotifications.updatedAt, staleAt))), lt(serviceCartNotifications.attemptCount, 3), lte(serviceCartNotifications.scheduledAt, now), eq(serviceCartCheckoutOrders.status, "paid"))).limit(30);

  for (const entry of queue) {
    if (!(await claimNotification(entry.notification.id))) continue;
    try {
      const rows = await db.select().from(serviceCartCheckoutItems).where(eq(serviceCartCheckoutItems.cartOrderId, entry.order.id));
      if (rows.length === 0) {
        await db.update(serviceCartNotifications).set({ status: "skipped", error: "El carrito no tiene servicios" }).where(eq(serviceCartNotifications.id, entry.notification.id));
        continue;
      }
      const items = await Promise.all(rows.map(async (item) => ({ ...item, bookingCode: await bookingCode(db, item) })));
      const email = buildServiceCartConfirmationEmail({ clientName: entry.order.clientName, totalClp: entry.order.totalClp, items });
      const result = await sendEmail({ to: entry.order.clientEmail, ...email, senderName: "Cancagua", replyTo: "contacto@cancagua.cl" });
      await db.update(serviceCartNotifications).set(result.success ? { status: "sent", sentAt: new Date(), providerId: result.id ?? null, error: null } : { status: "failed", scheduledAt: new Date(Date.now() + RETRY_DELAY_MS), error: result.error?.slice(0, 2000) || "Error desconocido" }).where(eq(serviceCartNotifications.id, entry.notification.id));
    } catch (error) {
      await db.update(serviceCartNotifications).set({ status: "failed", scheduledAt: new Date(Date.now() + RETRY_DELAY_MS), error: String(error).slice(0, 2000) }).where(eq(serviceCartNotifications.id, entry.notification.id));
    }
  }
}

let started = false;
export function startServiceCartNotificationScheduler() {
  if (started || process.env.NODE_ENV === "test") return;
  started = true;
  void processServiceCartNotificationQueue();
  const timer = setInterval(() => void processServiceCartNotificationQueue(), POLL_MS);
  timer.unref?.();
}
