import { Router, Request, Response } from "express";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { massageBookings, massageTechniques, massageTherapists } from "../drizzle/schema";
import { sendWhatsApp } from "./_core/whapi";
import { sendFreelanceApprovalRequestEmail } from "./_core/email";
import { ENV } from "./_core/env";

const router = Router();

function htmlPage(title: string, body: string, emoji: string, btnColor: string) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Cancagua Spa</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:20px}
    .card{background:#fff;border-radius:16px;padding:40px 32px;max-width:440px;width:100%;
      text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
    .emoji{font-size:56px;margin-bottom:20px}
    h1{font-size:22px;color:#18181b;margin-bottom:12px}
    p{font-size:15px;color:#71717a;line-height:1.6}
    small{display:block;margin-top:24px;font-size:12px;color:#a1a1aa}
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">${emoji}</div>
    <h1>${title}</h1>
    <p>${body}</p>
    <small>Cancagua Spa · Sistema de masajes</small>
  </div>
</body>
</html>`;
}

function dateStr(raw: unknown): string {
  return raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).slice(0, 10);
}

function humanDate(ds: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    weekday: "long", day: "numeric", month: "long", timeZone: "America/Santiago",
  }).format(new Date(ds + "T12:00:00"));
}

// Called from getnetWebhook.ts after a FREELANCE booking is paid
export async function sendFreelanceApprovalRequest(bookingId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const [booking] = await db
    .select({
      id: massageBookings.id,
      clientName: massageBookings.clientName,
      bookingDate: massageBookings.bookingDate,
      startTime: massageBookings.startTime,
      endTime: massageBookings.endTime,
      duration: massageBookings.duration,
      notes: massageBookings.notes,
      freelanceApprovalStatus: massageBookings.freelanceApprovalStatus,
      therapistName: massageTherapists.name,
      therapistPhone: massageTherapists.phone,
      therapistEmail: massageTherapists.email,
      techniqueName: massageTechniques.name,
    })
    .from(massageBookings)
    .leftJoin(massageTherapists, eq(massageBookings.therapistId, massageTherapists.id))
    .leftJoin(massageTechniques, eq(massageBookings.techniqueId, massageTechniques.id))
    .where(eq(massageBookings.id, bookingId))
    .limit(1);

  if (!booking) return;

  // Already has an approval in progress
  if (booking.freelanceApprovalStatus) return;

  // Flujo simplificado: notificar directamente al terapeuta (sin paso de aprobación del admin)
  if (!booking.therapistPhone) {
    console.warn(`[FreelanceApproval] Terapeuta sin teléfono para booking ${bookingId}, notificando a Tamara`);
    await sendWhatsApp("+56999002232",
      `⚠️ *Reserva sin terapeuta contactable* — Cancagua Spa\n\nSe necesita asignación manual para:\n👤 ${booking.clientName}\n💆 ${booking.techniqueName ?? "Masaje"} · ${booking.duration} min\n📅 ${humanDate(dateStr(booking.bookingDate))}\n🕐 ${booking.startTime} – ${booking.endTime} hrs\n\nEl terapeuta asignado no tiene teléfono registrado.`
    ).catch((e) => console.error("[FreelanceApproval] WA Tamara:", e));
    return;
  }

  const therapistToken = randomBytes(32).toString("hex");
  await db.update(massageBookings)
    .set({ freelanceApprovalStatus: "admin_approved", therapistConfirmationToken: therapistToken })
    .where(eq(massageBookings.id, bookingId));

  const ds = dateStr(booking.bookingDate);
  const hd = humanDate(ds);
  const therapistName = booking.therapistName ?? "Terapeuta";
  const techniqueName = booking.techniqueName ?? "Masaje";

  const confirmUrl = `${ENV.appUrl}/api/masajes/freelance-confirmation?token=${therapistToken}&action=confirm`;
  const rejectUrl = `${ENV.appUrl}/api/masajes/freelance-confirmation?token=${therapistToken}&action=reject`;

  await sendWhatsApp(
    booking.therapistPhone,
    `📅 *Nueva reserva asignada* — Cancagua Spa\n\nHola ${therapistName}! Tienes una reserva asignada.\n\n💆 ${techniqueName} · ${booking.duration} min\n👤 Cliente: ${booking.clientName}\n📅 ${hd}\n🕐 ${booking.startTime} – ${booking.endTime} hrs\n\n¿Puedes realizar este masaje?\n\n1️⃣ Confirmo masaje:\n${confirmUrl}\n\n2️⃣ No puedo realizarlo:\n${rejectUrl}`
  ).catch((e) => console.error("[FreelanceApproval] WA terapeuta:", e));

}

// GET /api/masajes/freelance-approval?token=&action=approve|reject  (Tamara)
router.get("/freelance-approval", async (req: Request, res: Response) => {
  const token = String(req.query.token ?? "");
  const action = String(req.query.action ?? "");

  if (!token || (action !== "approve" && action !== "reject")) {
    return res.status(400).send(htmlPage("Enlace inválido", "Este enlace no es válido.", "⚠️", "#ef4444"));
  }

  const db = await getDb();
  if (!db) return res.status(500).send(htmlPage("Error", "No se pudo conectar a la base de datos.", "⚠️", "#ef4444"));

  const [booking] = await db
    .select({
      id: massageBookings.id,
      clientName: massageBookings.clientName,
      bookingDate: massageBookings.bookingDate,
      startTime: massageBookings.startTime,
      endTime: massageBookings.endTime,
      duration: massageBookings.duration,
      freelanceApprovalStatus: massageBookings.freelanceApprovalStatus,
      therapistName: massageTherapists.name,
      therapistPhone: massageTherapists.phone,
      techniqueName: massageTechniques.name,
    })
    .from(massageBookings)
    .leftJoin(massageTherapists, eq(massageBookings.therapistId, massageTherapists.id))
    .leftJoin(massageTechniques, eq(massageBookings.techniqueId, massageTechniques.id))
    .where(eq(massageBookings.adminApprovalToken, token))
    .limit(1);

  if (!booking) {
    return res.send(htmlPage("Enlace inválido", "Este enlace no es válido o ya fue utilizado.", "⚠️", "#f59e0b"));
  }
  if (booking.freelanceApprovalStatus !== "pending_admin") {
    return res.send(htmlPage("Ya procesado", "Esta solicitud ya fue procesada anteriormente.", "ℹ️", "#6366f1"));
  }

  const ds = dateStr(booking.bookingDate);
  const hd = humanDate(ds);
  const therapistName = booking.therapistName ?? "el terapeuta";

  if (action === "reject") {
    await db.update(massageBookings)
      .set({ freelanceApprovalStatus: "admin_rejected" })
      .where(eq(massageBookings.id, booking.id));

    return res.send(htmlPage(
      "Asignación rechazada",
      `La asignación de ${therapistName} para el masaje de ${booking.clientName} quedará en asignación manual.`,
      "❌", "#ef4444"
    ));
  }

  // Approve: generate therapist token and notify
  const therapistToken = randomBytes(32).toString("hex");
  await db.update(massageBookings)
    .set({ freelanceApprovalStatus: "admin_approved", therapistConfirmationToken: therapistToken })
    .where(eq(massageBookings.id, booking.id));

  if (booking.therapistPhone) {
    const confirmUrl = `${ENV.appUrl}/api/masajes/freelance-confirmation?token=${therapistToken}&action=confirm`;
    const rejectUrl = `${ENV.appUrl}/api/masajes/freelance-confirmation?token=${therapistToken}&action=reject`;
    const techniqueName = booking.techniqueName ?? "Masaje";

    await sendWhatsApp(
      booking.therapistPhone,
      `📅 *Nueva reserva asignada* — Cancagua Spa\n\nHola ${booking.therapistName}! Tienes una reserva asignada.\n\n💆 ${techniqueName} · ${booking.duration} min\n👤 Cliente: ${booking.clientName}\n📅 ${hd}\n🕐 ${booking.startTime} – ${booking.endTime} hrs\n\n¿Puedes realizar este masaje?\n\n1️⃣ Confirmo masaje:\n${confirmUrl}\n\n2️⃣ No puedo realizarlo:\n${rejectUrl}`
    ).catch((e) => console.error("[FreelanceApproval] WA terapeuta:", e));
  }

  return res.send(htmlPage(
    "¡Aprobado!",
    `Se notificó a ${therapistName} para que confirme el masaje de ${booking.clientName} el ${hd}.`,
    "✅", "#10b981"
  ));
});

// GET /api/masajes/freelance-confirmation?token=&action=confirm|reject  (Terapeuta)
router.get("/freelance-confirmation", async (req: Request, res: Response) => {
  const token = String(req.query.token ?? "");
  const action = String(req.query.action ?? "");

  if (!token || (action !== "confirm" && action !== "reject")) {
    return res.status(400).send(htmlPage("Enlace inválido", "Este enlace no es válido.", "⚠️", "#ef4444"));
  }

  const db = await getDb();
  if (!db) return res.status(500).send(htmlPage("Error", "No se pudo conectar a la base de datos.", "⚠️", "#ef4444"));

  const [booking] = await db
    .select({
      id: massageBookings.id,
      clientName: massageBookings.clientName,
      bookingDate: massageBookings.bookingDate,
      startTime: massageBookings.startTime,
      endTime: massageBookings.endTime,
      freelanceApprovalStatus: massageBookings.freelanceApprovalStatus,
      therapistName: massageTherapists.name,
      techniqueName: massageTechniques.name,
    })
    .from(massageBookings)
    .leftJoin(massageTherapists, eq(massageBookings.therapistId, massageTherapists.id))
    .leftJoin(massageTechniques, eq(massageBookings.techniqueId, massageTechniques.id))
    .where(eq(massageBookings.therapistConfirmationToken, token))
    .limit(1);

  if (!booking) {
    return res.send(htmlPage("Enlace inválido", "Este enlace no es válido o ya fue utilizado.", "⚠️", "#f59e0b"));
  }
  if (booking.freelanceApprovalStatus !== "admin_approved") {
    return res.send(htmlPage("Ya procesado", "Esta solicitud ya fue procesada anteriormente.", "ℹ️", "#6366f1"));
  }

  const ds = dateStr(booking.bookingDate);
  const hd = humanDate(ds);
  const therapistName = booking.therapistName ?? "Terapeuta";
  const techniqueName = booking.techniqueName ?? "Masaje";

  // Get manager to notify
  const [manager] = await db
    .select({ phone: massageTherapists.phone })
    .from(massageTherapists)
    .where(eq(massageTherapists.isManager, 1))
    .limit(1);

  const TAMARA_PHONE = "+56999002232";

  if (action === "reject") {
    await db.update(massageBookings)
      .set({ freelanceApprovalStatus: "therapist_rejected" })
      .where(eq(massageBookings.id, booking.id));

    // Notificar a Tamara directamente con número fijo
    await sendWhatsApp(
      TAMARA_PHONE,
      `❌ *${therapistName}* no puede realizar el masaje.\n\n👤 ${booking.clientName}\n💆 ${techniqueName}\n📅 ${hd} · ${booking.startTime} hrs\n\n⚠️ Se requiere asignación manual de terapeuta. Aparece en el dashboard.`
    ).catch((e) => console.error("[FreelanceApproval] WA Tamara rechazo:", e));

    return res.send(htmlPage(
      "Gracias por avisarnos",
      "Hemos notificado al equipo de Cancagua Spa. Se asignará otro terapeuta.",
      "👍", "#6366f1"
    ));
  }

  // Confirm
  await db.update(massageBookings)
    .set({ freelanceApprovalStatus: "therapist_confirmed", status: "confirmed" })
    .where(eq(massageBookings.id, booking.id));

  // Notificar a Tamara que el terapeuta confirmó
  await sendWhatsApp(
    TAMARA_PHONE,
    `✅ *${therapistName}* confirmó el masaje.\n\n👤 ${booking.clientName}\n💆 ${techniqueName}\n📅 ${hd} · ${booking.startTime} hrs\nYa aparece confirmado en el dashboard.`
  ).catch((e) => console.error("[FreelanceApproval] WA Tamara confirmacion:", e));

  return res.send(htmlPage(
    "¡Masaje confirmado!",
    `Gracias ${therapistName}. El masaje de ${booking.clientName} queda confirmado para el ${hd} a las ${booking.startTime} hrs.`,
    "✅", "#10b981"
  ));
});

export default router;
