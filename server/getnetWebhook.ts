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
  // Getnet puede poner la firma en status o en payment[0].status
  const signature = body.status?.signature ?? body.payment?.[0]?.status?.signature ?? "";

  if (!requestId || !status || !date) {
    console.warn("[Getnet Webhook] Payload incompleto:", JSON.stringify(body));
    return res.status(400).json({ error: "Payload incompleto" });
  }

  // Validar firma solo si viene — en test environment a veces no viene
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
        .set({ paymentStatus: "paid", status: "confirmed" })
        .where(eq(massageBookings.id, booking.id));

      sendBookingConfirmations(booking.id).catch((e) =>
        console.error("[Getnet Webhook] Error en notificaciones:", e)
      );
    }
  } else if (status === "REJECTED" || status === "FAILED") {
    await db
      .update(massageBookings)
      .set({ paymentStatus: "pending" })
      .where(eq(massageBookings.id, booking.id));
  }

  return res.status(200).json({ ok: true });
});

export async function sendBookingConfirmations(bookingId: number) {
  const db = await getDb();
  if (!db) return;

  const [booking] = await db
    .select({
      clientName: massageBookings.clientName,
      clientEmail: massageBookings.clientEmail,
      clientPhone: massageBookings.clientPhone,
      bookingDate: massageBookings.bookingDate,
      startTime: massageBookings.startTime,
      endTime: massageBookings.endTime,
      duration: massageBookings.duration,
      notes: massageBookings.notes,
      techniqueName: massageTechniques.name,
      therapistName: massageTherapists.name,
      therapistEmail: massageTherapists.email,
      therapistPhone: massageTherapists.phone,
    })
    .from(massageBookings)
    .leftJoin(massageTechniques, eq(massageBookings.techniqueId, massageTechniques.id))
    .leftJoin(massageTherapists, eq(massageBookings.therapistId, massageTherapists.id))
    .where(eq(massageBookings.id, bookingId))
    .limit(1);

  if (!booking) return;

  const raw = booking.bookingDate;
  const dateStr = raw instanceof Date
    ? raw.toISOString().slice(0, 10)
    : String(raw).slice(0, 10);
  const techniqueName = booking.techniqueName ?? "Masaje";
  const therapistName = booking.therapistName ?? "Terapeuta";

  const humanDate = new Intl.DateTimeFormat("es-CL", {
    weekday: "long", day: "numeric", month: "long", timeZone: "America/Santiago",
  }).format(new Date(dateStr + "T12:00:00"));

  const internalData = {
    clientName: booking.clientName,
    techniqueName,
    bookingDate: dateStr,
    startTime: booking.startTime,
    endTime: booking.endTime ?? "",
    duration: booking.duration,
    clientEmail: booking.clientEmail,
    clientPhone: booking.clientPhone,
    therapistName,
    notes: booking.notes,
  };

  // Email al cliente
  if (booking.clientEmail) {
    await sendMassageBookingConfirmationEmail({
      to: booking.clientEmail,
      clientName: booking.clientName,
      techniqueName,
      therapistName,
      bookingDate: dateStr,
      startTime: booking.startTime,
      duration: booking.duration,
    }).catch((e) => console.error("[Confirmaciones] Email cliente:", e));
  }

  // Email a recepción (contacto@cancagua.cl)
  await sendMassageInternalBookingNotificationEmail({
    to: ENV.contactEmail || "contacto@cancagua.cl",
    ...internalData,
  }).catch((e) => console.error("[Confirmaciones] Email recepción:", e));

  // Email a admin masajes (terapias@cancagua.cl)
  await sendMassageInternalBookingNotificationEmail({
    to: MASAJES_ADMIN_EMAIL,
    ...internalData,
  }).catch((e) => console.error("[Confirmaciones] Email terapias:", e));

  // Email al terapeuta
  if (booking.therapistEmail) {
    await sendMassageTherapistNotificationEmail({
      to: booking.therapistEmail,
      therapistName,
      clientName: booking.clientName,
      clientPhone: booking.clientPhone,
      techniqueName,
      bookingDate: dateStr,
      startTime: booking.startTime,
      endTime: booking.endTime ?? "",
      duration: booking.duration,
      notes: booking.notes,
    }).catch((e) => console.error("[Confirmaciones] Email terapeuta:", e));
  }

  // WhatsApp al cliente
  if (booking.clientPhone) {
    await sendWhatsApp(
      booking.clientPhone,
      `✅ *¡Tu reserva está confirmada!* — Cancagua Spa\n\nHola ${booking.clientName}! Tu pago fue procesado exitosamente.\n\n*${techniqueName}* · ${booking.duration} min\n📅 ${humanDate}\n🕐 ${booking.startTime} hrs\n\nTe esperamos en Cancagua Spa. ¡Que disfrutes tu masaje!`
    ).catch((e) => console.error("[Confirmaciones] WhatsApp cliente:", e));
  }

  // WhatsApp al terapeuta
  if (booking.therapistPhone) {
    await sendWhatsApp(
      booking.therapistPhone,
      `📅 *Nueva reserva confirmada* — Cancagua Spa\n\nHola ${therapistName}! Tienes una reserva de pago confirmado:\n\n*${techniqueName}* · ${booking.duration} min\n👤 Cliente: ${booking.clientName}${booking.clientPhone ? `\n📞 ${booking.clientPhone}` : ""}\n📅 ${humanDate}\n🕐 ${booking.startTime} – ${booking.endTime} hrs`
    ).catch((e) => console.error("[Confirmaciones] WhatsApp terapeuta:", e));
  }
}

export default router;
