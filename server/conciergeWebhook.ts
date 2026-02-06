/**
 * Webhook Handler para Skedu - Módulo Concierge
 * Recibe notificaciones de nuevas reservas y pagos desde Skedu
 */
import { Router, Request, Response } from "express";
import * as conciergeDb from "./conciergeDb";

const router = Router();

// Interfaz para el payload del webhook de Skedu
interface SkeduWebhookPayload {
  BusinessUUID: string;
  Secret: string;
  Action: string;
  AppointmentsCreated?: {
    AppointmentGroupUUID: string;
    CreatedAt: string;
    StoreUUID?: string;
    ServiceUUID?: string;
    UserUUID?: string;
    AppointmentUUIDs?: string[];
    Message?: string;
    Origin?: string;
  };
  // Parámetros UTM que pueden venir en la reserva
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
}

// Verificar el secreto del webhook
const WEBHOOK_SECRET = process.env.SKEDU_WEBHOOK_SECRET || "";

/**
 * Endpoint principal para recibir webhooks de Skedu
 * POST /api/webhooks/skedu/concierge
 */
router.post("/concierge", async (req: Request, res: Response) => {
  try {
    const payload = req.body as SkeduWebhookPayload;

    console.log("[Concierge Webhook] Received:", {
      action: payload.Action,
      businessUUID: payload.BusinessUUID,
      utm_content: payload.utm_content,
    });

    // Verificar secreto si está configurado
    if (WEBHOOK_SECRET && payload.Secret !== WEBHOOK_SECRET) {
      console.warn("[Concierge Webhook] Invalid secret");
      return res.status(401).json({ success: false, message: "Invalid secret" });
    }

    // Solo procesar creación de reservas
    if (payload.Action !== "APPOINTMENTS_CREATED") {
      console.log("[Concierge Webhook] Ignored action:", payload.Action);
      return res.json({ success: true, message: `Ignored: ${payload.Action}` });
    }

    // Buscar la referencia de venta Concierge
    // La referencia puede venir en utm_content o en el Message de la reserva
    let saleReference = payload.utm_content;

    // Si no está en utm_content, buscar en el Message
    if (!saleReference && payload.AppointmentsCreated?.Message) {
      const match = payload.AppointmentsCreated.Message.match(/CONC-[A-Z0-9]+/);
      if (match) {
        saleReference = match[0];
      }
    }

    // Si no hay referencia de Concierge, ignorar
    if (!saleReference || !saleReference.startsWith("CONC-")) {
      console.log("[Concierge Webhook] Not a concierge sale, ignoring");
      return res.json({ success: true, message: "Not a concierge sale" });
    }

    console.log("[Concierge Webhook] Processing sale reference:", saleReference);

    // Buscar la venta pendiente
    const sale = await conciergeDb.getConciergeSaleByReference(saleReference);
    if (!sale) {
      console.warn("[Concierge Webhook] Sale not found:", saleReference);
      return res.status(404).json({ success: false, message: "Sale not found" });
    }

    // Verificar que la venta está pendiente
    if (sale.status !== "pending") {
      console.log("[Concierge Webhook] Sale already processed:", saleReference);
      return res.json({ success: true, message: "Sale already processed" });
    }

    // Actualizar la venta como completada
    await conciergeDb.updateConciergeSaleStatus(sale.id, "completed", {
      skeduGroupUuid: payload.AppointmentsCreated?.AppointmentGroupUUID,
      skeduAppointmentUuid: payload.AppointmentsCreated?.AppointmentUUIDs?.[0],
      confirmedAt: new Date(),
    });

    console.log("[Concierge Webhook] Sale completed successfully:", saleReference);

    // Responder éxito
    return res.json({
      success: true,
      message: "Sale confirmed",
      saleReference,
    });
  } catch (error) {
    console.error("[Concierge Webhook] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

/**
 * Endpoint para verificar que el webhook está funcionando
 * GET /api/webhooks/skedu/concierge/health
 */
router.get("/concierge/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "Concierge Webhook",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Endpoint para recibir notificaciones de pagos
 * POST /api/webhooks/skedu/concierge/payment
 */
router.post("/concierge/payment", async (req: Request, res: Response) => {
  try {
    const payload = req.body;

    console.log("[Concierge Webhook] Payment notification:", payload);

    // Verificar secreto
    if (WEBHOOK_SECRET && payload.Secret !== WEBHOOK_SECRET) {
      return res.status(401).json({ success: false, message: "Invalid secret" });
    }

    // Buscar la referencia en la descripción del pago
    const description = payload.Description || "";
    const match = description.match(/CONC-[A-Z0-9]+/);

    if (!match) {
      return res.json({ success: true, message: "Not a concierge payment" });
    }

    const saleReference = match[0];
    const sale = await conciergeDb.getConciergeSaleByReference(saleReference);

    if (!sale) {
      return res.status(404).json({ success: false, message: "Sale not found" });
    }

    // Actualizar estado de pago si es necesario
    if (sale.status === "pending") {
      await conciergeDb.updateConciergeSaleStatus(sale.id, "completed", {
        confirmedAt: new Date(),
      });
    }

    return res.json({
      success: true,
      message: "Payment processed",
      saleReference,
    });
  } catch (error) {
    console.error("[Concierge Webhook] Payment error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

export default router;
