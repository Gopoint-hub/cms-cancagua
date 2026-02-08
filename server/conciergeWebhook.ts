/**
 * Webhook Handler para el Módulo Concierge
 * La confirmación de pagos WebPay se maneja vía tRPC (concierge.payment.confirm)
 * Este archivo mantiene endpoints auxiliares de salud y estado.
 */
import { Router, Request, Response } from "express";

const router = Router();

/**
 * Endpoint para verificar que el servicio Concierge está funcionando
 * GET /api/webhooks/concierge/health
 */
router.get("/concierge/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "Concierge Module",
    paymentMethod: "WebPay",
    timestamp: new Date().toISOString(),
  });
});

export default router;
