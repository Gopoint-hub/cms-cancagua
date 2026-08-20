export const MANUAL_MASSAGE_PAYMENT_METHODS = [
  "pending_payment",
  "getnet_link",
  "getnet_pos",
  "bank_transfer",
  "cash",
  "gift_card",
  "transbank",
] as const;

export type ManualMassagePaymentMethod =
  (typeof MANUAL_MASSAGE_PAYMENT_METHODS)[number];

export type MassagePaymentMethod =
  | ManualMassagePaymentMethod
  | "getnet"
  | "cms_manual"
  | "discount_code"
  | "skedu_program";

export const MASSAGE_PAYMENT_METHOD_LABELS: Record<MassagePaymentMethod, string> = {
  pending_payment: "Pendiente de pago",
  getnet: "Link de pago Getnet",
  getnet_link: "Link de pago Getnet",
  getnet_pos: "Máquina Getnet en recepción",
  bank_transfer: "Transferencia bancaria",
  cash: "Efectivo",
  gift_card: "Gift Card",
  transbank: "Transbank",
  cms_manual: "CMS manual (sin especificar)",
  discount_code: "Código de descuento",
  skedu_program: "Programa Skedu (histórico)",
};

export function getMassagePaymentMethodLabel(value?: string | null): string {
  if (!value) return "Sin especificar";
  return MASSAGE_PAYMENT_METHOD_LABELS[value as MassagePaymentMethod] ?? value;
}
