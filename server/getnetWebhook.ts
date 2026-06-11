import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { massageBookings, massageTechniques, massageTherapists } from "../drizzle/schema";
import { validateGetnetWebhookSignature } from "./getnet";
import { sendMassageBookingConfirmationEmail, sendMassageTherapistNotificationEmail } from "./_core/email";
import { sendWhatsApp } from "./_core/whapi";

const router = Router();

// POST /api/webhooks/getnet
// Getnet notifica el resultado del pago de forma asíncrona
router.post("/", async (req: Request, res: Response) => {
  const body = req.body as {
    requestId?: string;
    status?: {
      status?: string;
      reason?: string;
      message?: string;
      date?: string;
      signature?: string;
    };
    payment?: Array<{
      reference?: string;
      amount?: { total?: number; currency?: string };
      status?: { status?: string; signature?: string };
    }>;
  };

  const requestId = body.requestId;
  const status = body.status?.status ?? "";
  const date = body.status?.date ?? "";
  const signature = body.status?.signature ?? "";

  if (!requestId || !status || !date || !signature) {
    console.warn("[Getnet Webhook] Payload incompleto:", JSON.stringify(body));
    return res.status(400).json({ error: "Payload incompleto" });
  }

  if (!validateGetnetWebhookSignature(requestId, status, date, signature)) {
    console.error("[Getnet Webhook] Firma inválida para requestId:", requestId);
    return res.status(401).json({ error: "Firma inválida" });
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
    return res.status(200).json({ ok: true }); // Responder 200 para que Getnet no reintente
  }

  if (status === "APPROVED") {
    if (booking.paymentStatus !== "paid") {
      await db
        .update(massageBookings)
        .set({ paymentStatus: "paid", status: "confirmed" })
        .where(eq(massageBookings.id, booking.id));

      // Fire-and-forget: enviar confirmaciones
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

async function sendBookingConfirmations(bookingId: number) {
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
      amountPaid: massageBookings.amountPaid,
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

  const dateStr = String(booking.bookingDate).slice(0, 10);

  if (booking.clientEmail) {
    await sendMassageBookingConfirmationEmail({
      to: booking.clientEmail,
      clientName: booking.clientName,
      techniqueName: booking.techniqueName ?? "Masaje",
      therapistName: booking.therapistName ?? undefined,
      bookingDate: dateStr,
      startTime: booking.startTime,
      duration: booking.duration,
      amountPaid: booking.amountPaid ? String(booking.amountPaid) : undefined,
    });
  }

  if (booking.therapistEmail) {
    await sendMassageTherapistNotificationEmail({
      to: booking.therapistEmail,
      therapistName: booking.therapistName ?? "Terapeuta",
      clientName: booking.clientName,
      clientPhone: booking.clientPhone,
      techniqueName: booking.techniqueName ?? "Masaje",
      bookingDate: dateStr,
      startTime: booking.startTime,
      endTime: booking.endTime,
      duration: booking.duration,
      notes: booking.notes,
    });
  }

  if (booking.therapistPhone) {
    const humanDate = new Intl.DateTimeFormat("es-CL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "America/Santiago",
    }).format(new Date(dateStr + "T12:00:00"));

    await sendWhatsApp(
      booking.therapistPhone,
      `📅 *Nueva reserva confirmada* — Cancagua Spa\n\nHola ${booking.therapistName ?? ""}! Tienes una reserva de pago confirmado:\n\n*${booking.techniqueName ?? "Masaje"}* · ${booking.duration} min\n👤 Cliente: ${booking.clientName}${booking.clientPhone ? `\n📞 ${booking.clientPhone}` : ""}\n📅 ${humanDate}\n🕐 ${booking.startTime} – ${booking.endTime} hrs`
    );
  }

  // WhatsApp de confirmación al cliente
  if (booking.clientPhone) {
    const humanDate = new Intl.DateTimeFormat("es-CL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "America/Santiago",
    }).format(new Date(dateStr + "T12:00:00"));

    await sendWhatsApp(
      booking.clientPhone,
      `✅ *¡Tu reserva está confirmada!* — Cancagua Spa\n\nHola ${booking.clientName}! Tu pago fue procesado exitosamente.\n\n*${booking.techniqueName ?? "Masaje"}* · ${booking.duration} min\n📅 ${humanDate}\n🕐 ${booking.startTime} hrs\n\nTe esperamos en Cancagua Spa. ¡Que disfrutes tu masaje!`
    );
  }
}

export default router;
