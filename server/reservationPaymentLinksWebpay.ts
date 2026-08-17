import { Router, type Request, type Response } from "express";
import { ENV } from "./_core/env";
import { handleReservationPaymentLinkWebpayReturn } from "./reservationPaymentLinks";

const router = Router();

function firstString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) return firstString(value[0]);
  return undefined;
}

router.all("/return", async (req: Request, res: Response) => {
  const tokenWs = firstString(req.body?.token_ws ?? req.query?.token_ws);
  const tbkToken = firstString(req.body?.TBK_TOKEN ?? req.query?.TBK_TOKEN);
  const buyOrder = firstString(req.body?.TBK_ORDEN_COMPRA ?? req.query?.TBK_ORDEN_COMPRA);
  const sessionId = firstString(req.body?.TBK_ID_SESION ?? req.query?.TBK_ID_SESION);
  const result = await handleReservationPaymentLinkWebpayReturn({ tokenWs, tbkToken, buyOrder, sessionId });
  const base = ENV.appUrl?.replace(/\/$/, "") ?? "https://cms.cancagua.cl";
  if (!result.publicToken) return res.redirect(303, `${base}/pagar?estado=error`);
  return res.redirect(303, `${base}/pagar/${result.publicToken}?estado=${result.status}`);
});

export default router;
