import { ENV } from "./_core/env";
import { isTransactionApproved } from "./webpay";

export function serviceCartResultUrl(publicToken: string, state: string): string {
  const frontend = (ENV.frontendUrl || ENV.appUrl || "https://cancagua.cl").replace(/\/$/, "");
  return `${frontend}/servicios/pago/resultado?order=${encodeURIComponent(publicToken)}&estado=${encodeURIComponent(state)}`;
}

export function validateServiceCartPayment(
  order: { webpayToken: string | null; buyOrder: string | null; sessionId: string | null; totalClp: number },
  result: { buyOrder: string; sessionId: string; amount: number; responseCode: number; status: string },
  token: string,
): { approved: boolean; reason?: string } {
  if (!order.webpayToken || order.webpayToken !== token) return { approved: false, reason: "Token Webpay no corresponde" };
  if (!order.buyOrder || order.buyOrder !== result.buyOrder) return { approved: false, reason: "Orden Webpay no corresponde" };
  if (!order.sessionId || order.sessionId !== result.sessionId) return { approved: false, reason: "Sesión Webpay no corresponde" };
  if (Number(result.amount) !== order.totalClp) return { approved: false, reason: "Monto Webpay no corresponde" };
  if (!isTransactionApproved(result.responseCode, result.status)) return { approved: false, reason: "Pago rechazado por Webpay" };
  return { approved: true };
}
