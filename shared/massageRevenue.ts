export function calculatePaidMassageBookingRevenue(
  bookings: Array<{
    paymentStatus?: string | null;
    status?: string | null;
    amountPaid?: string | number | null;
  }>,
): number {
  return bookings
    .filter((booking) =>
      booking.paymentStatus === "paid" && booking.status !== "cancelled",
    )
    .reduce((sum, booking) => sum + Number(booking.amountPaid ?? 0), 0);
}
