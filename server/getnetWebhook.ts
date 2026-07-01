import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { massageBookings, massageTechniques, massageTherapists } from "../drizzle/schema";
import { validateGetnetWebhookSignature } from "./getnet";
import {
  sendMassageBookingConfirmationEmail,
  sendMassageTherapistNotificationEmail,
  sendMassageInternalBookingNotificationEmail,
} from "./_core/email";
import { sendWhatsApp } from "./_core/whapi";
import { ENV } from "./_core/env";
import { sendFreelanceApprovalRequest } from "./freelanceApproval";

console.log("[SERVER] getnetWebhook v3 cargado — freelance approval activo");

const router = Router();

const MASAJES_ADMIN_EMAIL = "terapias@cancagua.cl";

router.post("/", async (req: Request, res: Response) => {
  const body = req.body as {
    requestId?: string;
    status?: { status?: string; reason?: string; message?: string; date?: string; signature?: string };
    payment?: Array<{ reference?: string; amount?: { total?: number; currency?: string }; status?: { status?: string; signature?: string } }>;
  };

  const requestId = body.requestId;
  const status = body.status?.status ?? "";
  const date = body.status?.date ?? "";
  const signature = body.status?.signature ?? body.payment?.[0]?.status?.signature ?? "";

  if (!requestId || !status || !date) {
    console.warn("[Getnet Webhook] Payload incompleto:", JSON.stringify(body));
    return res.status(400).json({ error: "Payload incompleto" });
  }

  if (!signature && ENV.isProduction) {
    console.error("[Getnet Webhook] Firma ausente en producción para requestId:", requestId);
    return res.status(401).json({ error: "Firma requerida" });
  }

  if (signature && !validateGetnetWebhookSignature(requestId, status, date, signature)) {
    console.error("[Getnet Webhook] Firma inválida para requestId:", requestId);
    return res.status(401).json({ error: "Firma inválida" });
  }

  if (!signature) {
    console.warn("[Getnet Webhook] Sin firma — procesando igual (modo pruebas)");
  }

  const db = await getDb();
  if (!db) return res.status(500).json({ error: "DB no disponible" });

  const [booking] = await db
    .select({ id: massageBookings.id, paymentStatus: massageBookings.paymentStatus })
    .from(massageBookings)
    .where(eq(massageBookings.getnetRequestId, requestId))
    .limit(1);

  if (!booking) {
    console.warn("[Getnet Webhook] No se encontró booking para requestId:", requestId);
    return res.status(200).json({ ok: true });
  }

  if (status === "APPROVED") {
    if (booking.paymentStatus !== "paid") {
      await db
        .update(massageBookings)
        .set({ paymentStatus: "paid", status: "pending" })
        .where(eq(massageBookings.id, booking.id));

      sendBookingConfirmations(booking.id).catch((e) =>
        console.error("[Getnet Webhook] Error en notificaciones:", e)
      );
    }
  } else if (status === "REJECTED" || status === "FAILED") {
    await db
      .update(massageBookings)
      .set({ paymentStatus: "pending", status: "cancelled" })
      .where(eq(massageBookings.id, booking.id));
  }

  return res.status(200).json({ ok: true });
});

export async function sendBookingConfirmations(bookingId: number) {
  console.log(`[sendBookingConfirmations] Iniciando para booking ${bookingId}`);
  const db = await getDb();
  if (!db) return;

  // ── Query 1: datos básicos del booking ──────────────────────────────────────
  const [bookingData] = await db
    .select({
      therapistId: massageBookings.therapistId,
      clientName: massageBookings.clientName,
      clientEmail: massageBookings.clientEmail,
      clientPhone: massageBookings.clientPhone,
      bookingDate: massageBookings.bookingDate,
      startTime: massageBookings.startTime,
      endTime: massageBookings.endTime,
      duration: massageBookings.duration,
      techniqueId: massageBookings.techniqueId,
      notes: massageBookings.notes,
    })
    .from(massageBookings)
    .where(eq(massageBookings.id, bookingId))
    .limit(1);

  if (!bookingData) {
    console.warn(`[sendBookingConfirmations] No se encontró booking ${bookingId}`);
    return;
  }

  // ── Query 2: tipo de terapeuta (query separada para evitar ambigüedad de JOIN) ─
  let therapistType: "inhouse" | "freelance" | null = null;
  let therapistName = "Terapeuta";
  let therapistEmail: string | null = null;
  let therapistPhone: string | null = null;

  if (bookingData.therapistId) {
    const [th] = await db
      .select({
        type: massageTherapists.type,
        name: massageTherapists.name,
        email: massageTherapists.email,
        phone: massageTherapists.phone,
      })
      .from(massageTherapists)
      .where(eq(massageTherapists.id, bookingData.therapistId))
      .limit(1);

    if (th) {
      therapistType = th.type;
      therapistName = th.name;
      therapistEmail = th.email ?? null;
      therapistPhone = th.phone ?? null;
    }
  }

  console.log(`[sendBookingConfirmations] booking=${bookingId} therapistId=${bookingData.therapistId} therapistType=${therapistType}`);

  // ── Query 3: nombre de la técnica ───────────────────────────────────────────
  let techniqueName = "Masaje";
  if (bookingData.techniqueId) {
    const [tq] = await db
      .select({ name: massageTechniques.name })
      .from(massageTechniques)
      .where(eq(massageTechniques.id, bookingData.techniqueId))
      .limit(1);
    if (tq) techniqueName = tq.name;
  }

  // ── Formato de fecha ────────────────────────────────────────────────────────
  const raw = bookingData.bookingDate;
  const dateStr = raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).slice(0, 10);
  const humanDate = new Intl.DateTimeFormat("es-CL", {
    weekday: "long", day: "numeric", month: "long", timeZone: "America/Santiago",
  }).format(new Date(dateStr + "T12:00:00"));

  const internalData = {
    clientName: bookingData.clientName,
    techniqueName,
    bookingDate: dateStr,
    startTime: bookingData.startTime,
    endTime: bookingData.endTime ?? "",
    duration: bookingData.duration,
    clientEmail: bookingData.clientEmail,
    clientPhone: bookingData.clientPhone,
    therapistName,
    notes: bookingData.notes,
  };

  // ── Emails a cliente y administración (siempre) ─────────────────────────────
  if (bookingData.clientEmail) {
    await sendMassageBookingConfirmationEmail({
      to: bookingData.clientEmail,
      clientName: bookingData.clientName,
      techniqueName,
      bookingDate: dateStr,
      startTime: bookingData.startTime,
      duration: bookingData.duration,
    }).catch((e) => console.error("[Confirmaciones] Email cliente:", e));
  }

  await sendMassageInternalBookingNotificationEmail({
    to: ENV.contactEmail || "contacto@cancagua.cl",
    ...internalData,
  }).catch((e) => console.error("[Confirmaciones] Email recepción:", e));

  await sendMassageInternalBookingNotificationEmail({
    to: MASAJES_ADMIN_EMAIL,
    ...internalData,
  }).catch((e) => console.error("[Confirmaciones] Email terapias:", e));

  // ── WhatsApp al cliente (siempre) ───────────────────────────────────────────
  if (bookingData.clientPhone) {
    await sendWhatsApp(
      bookingData.clientPhone,
      `✅ *¡Tu reserva está confirmada!* — Cancagua Spa\n\nHola ${bookingData.clientName}! Tu pago fue procesado exitosamente.\n\n*${techniqueName}* · ${bookingData.duration} min\n📅 ${humanDate}\n🕐 ${bookingData.startTime} hrs\n📍https://maps.app.goo.gl/mhKem25vtagvCiSm8\n*Recuerda llegar con 10 minutos de anticipación para hacer Check-in en recepción.*\n\nTe esperamos en Cancagua Spa. ¡Que disfrutes tu masaje!`
    ).catch((e) => console.error("[Confirmaciones] WhatsApp cliente:", e));
  }

  // ── Notificación al terapeuta según tipo ─────────────────────────────────────
  if (therapistType === "freelance") {
    // Freelance: queda "pending" hasta que el terapeuta confirme via WA
    console.log(`[sendBookingConfirmations] booking=${bookingId} → FREELANCE: enviando confirmación al terapeuta (booking queda pending)`);
    await sendFreelanceApprovalRequest(bookingId);
  } else if (therapistType === "inhouse") {
    // Inhouse: no necesita confirmación, se confirma de inmediato
    console.log(`[sendBookingConfirmations] booking=${bookingId} → INHOUSE: confirmando de inmediato`);
    await db.update(massageBookings)
      .set({ status: "confirmed" })
      .where(eq(massageBookings.id, bookingId));

    if (therapistEmail) {
      await sendMassageTherapistNotificationEmail({
        to: therapistEmail,
        therapistName,
        clientName: bookingData.clientName,
        clientPhone: bookingData.clientPhone,
        techniqueName,
        bookingDate: dateStr,
        startTime: bookingData.startTime,
        endTime: bookingData.endTime ?? "",
        duration: bookingData.duration,
        notes: bookingData.notes,
      }).catch((e) => console.error("[Confirmaciones] Email terapeuta:", e));
    }
    if (therapistPhone) {
      const result = await sendWhatsApp(
        therapistPhone,
        `📅 *Nueva reserva confirmada* — Cancagua Spa\n\nHola ${therapistName}! Tienes una reserva de pago confirmado:\n\n*${techniqueName}* · ${bookingData.duration} min\n👤 Cliente: ${bookingData.clientName}${bookingData.clientPhone ? `\n📞 ${bookingData.clientPhone}` : ""}\n📅 ${humanDate}\n🕐 ${bookingData.startTime} – ${bookingData.endTime} hrs`
      );
      if (!result.success) {
        console.error("[Confirmaciones] WhatsApp terapeuta falló:", result.error);
      } else {
        console.log(`[Confirmaciones] WhatsApp terapeuta enviado booking=${bookingId}`);
      }
    } else {
      console.warn(`[Confirmaciones] booking=${bookingId} terapeuta inhouse sin teléfono registrado`);
    }
  } else {
    // Sin terapeuta asignado: queda pending, aparece en dashboard como asignación pendiente
    console.warn(`[sendBookingConfirmations] booking=${bookingId} sin terapeuta → queda pending`);
  }
}

export default router;
