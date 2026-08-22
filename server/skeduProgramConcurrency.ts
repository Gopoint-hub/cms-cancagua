import { TRPCError } from "@trpc/server";

type ProgramBookingState = {
  id: number;
  status: string;
};

/**
 * Adquiere primero todos los mutex financieros del grupo y solo después vuelve
 * a leer sus reservas. De esta forma, una cancelación que ganó la carrera se
 * observa antes de registrar un cobro manual.
 */
export async function lockAndReloadSkeduProgramGroupForSettlement<
  Booking extends ProgramBookingState,
>(input: {
  bookingIds: number[];
  lockPaymentScopes: (bookingIds: number[]) => Promise<void>;
  assertNoLivePaymentAttempt: (bookingId: number) => Promise<void>;
  reloadBookings: (bookingIds: number[]) => Promise<Booking[]>;
}): Promise<Booking[]> {
  const bookingIds = [...new Set(input.bookingIds)].sort(
    (left, right) => left - right
  );
  if (bookingIds.length === 0) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Reserva de programa no encontrada",
    });
  }

  // El orden es deliberado: todos los scopes primero, luego requests/reservas.
  // Es el mismo orden que usa la creación de links de pago y evita deadlocks.
  await input.lockPaymentScopes(bookingIds);
  for (const bookingId of bookingIds) {
    await input.assertNoLivePaymentAttempt(bookingId);
  }

  const reloaded = await input.reloadBookings(bookingIds);
  const byId = new Map(reloaded.map(booking => [booking.id, booking]));
  const bookings = bookingIds
    .map(bookingId => byId.get(bookingId))
    .filter((booking): booking is Booking => Boolean(booking));
  if (bookings.length !== bookingIds.length) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "La reserva cambió mientras se preparaba el cobro",
    });
  }
  if (bookings.some(booking => booking.status === "cancelled")) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "No puedes cobrar una reserva cancelada",
    });
  }
  return bookings;
}
