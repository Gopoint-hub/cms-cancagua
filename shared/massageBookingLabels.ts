const MASSAGE_BOOKING_STATUS_LABELS: Record<string, string> = {
  pending: "Asignación pendiente",
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No llegó",
};

const MASSAGE_PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pago pendiente",
  partially_paid: "Pago parcial",
  paid: "Pagado",
  refunded: "Reembolsado",
};

export function getMassageBookingStatusLabel(status: string): string {
  return MASSAGE_BOOKING_STATUS_LABELS[status] ?? status;
}

export function getMassagePaymentStatusLabel(status: string): string {
  return MASSAGE_PAYMENT_STATUS_LABELS[status] ?? status;
}
