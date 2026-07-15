import { eq } from "drizzle-orm";
import { massageBookings, massageSales, massageTechniques } from "../drizzle/schema";
import { getDb } from "./db";

/**
 * Crea o sincroniza el registro histórico de una reserva pagada.
 * La restricción única por bookingId hace esta operación idempotente para
 * webhook, fallback de Getnet y pagos manuales concurrentes.
 */
export async function syncMassageSale(bookingId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const [booking] = await db.select({
    id: massageBookings.id,
    paymentStatus: massageBookings.paymentStatus,
    bookingDate: massageBookings.bookingDate,
    startTime: massageBookings.startTime,
    clientName: massageBookings.clientName,
    clientEmail: massageBookings.clientEmail,
    duration: massageBookings.duration,
    amountPaid: massageBookings.amountPaid,
    getnetRequestId: massageBookings.getnetRequestId,
    techniqueName: massageTechniques.name,
  })
    .from(massageBookings)
    .leftJoin(massageTechniques, eq(massageBookings.techniqueId, massageTechniques.id))
    .where(eq(massageBookings.id, bookingId))
    .limit(1);

  if (!booking || (booking.paymentStatus !== "paid" && booking.paymentStatus !== "refunded")) return;

  const sale = {
    bookingId: booking.id,
    serviceDate: booking.bookingDate,
    startTime: booking.startTime,
    clientName: booking.clientName,
    clientEmail: booking.clientEmail,
    techniqueName: booking.techniqueName ?? "Masaje",
    duration: booking.duration,
    amount: booking.amountPaid ?? "0",
    paymentMethod: booking.getnetRequestId ? "getnet" as const : "cms_manual" as const,
    paymentReference: booking.getnetRequestId,
    status: booking.paymentStatus === "refunded" ? "refunded" as const : "paid" as const,
  };

  await db.insert(massageSales).values(sale).onDuplicateKeyUpdate({
    set: {
      serviceDate: sale.serviceDate,
      startTime: sale.startTime,
      clientName: sale.clientName,
      clientEmail: sale.clientEmail,
      techniqueName: sale.techniqueName,
      duration: sale.duration,
      amount: sale.amount,
      paymentMethod: sale.paymentMethod,
      paymentReference: sale.paymentReference,
      status: sale.status,
    },
  });
}
