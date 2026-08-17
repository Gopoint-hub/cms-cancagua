export const RESERVATION_PAYMENT_METHODS = [
  "pending_payment",
  "payment_link",
  "bank_transfer",
  "cash",
  "transbank_machine",
  "gift_card",
  "getnet_link",
  "getnet_pos",
  "transbank",
] as const;

export type ReservationPaymentMethod = typeof RESERVATION_PAYMENT_METHODS[number];
export type ReservationPaymentStatus = "pending" | "paid" | "refunded";

export const RESERVATION_PAYMENT_LABELS: Record<ReservationPaymentMethod, string> = {
  pending_payment: "Pendiente de pago",
  payment_link: "Link de pago",
  bank_transfer: "Transferencia",
  cash: "Efectivo",
  transbank_machine: "Máquina Transbank",
  gift_card: "Gift Card",
  getnet_link: "Link de pago Getnet",
  getnet_pos: "Máquina Getnet en recepción",
  transbank: "Transbank",
};

export const CARD_PAYMENT_METHODS: readonly ReservationPaymentMethod[] = [
  "payment_link",
  "transbank_machine",
  "getnet_link",
  "getnet_pos",
  "transbank",
];

export const PENDING_PAYMENT_METHODS: readonly ReservationPaymentMethod[] = [
  "pending_payment",
  "payment_link",
  "getnet_link",
];

export function calculatedPaymentStatus(amountPaid: number, total: number) {
  if (amountPaid <= 0) return "pending" as const;
  if (amountPaid < total) return "partially_paid" as const;
  return "paid" as const;
}
