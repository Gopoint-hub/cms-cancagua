import { eq, sql } from "drizzle-orm";
import { discountCodes, massageBookings, massageSales, massageTechniques } from "../drizzle/schema";
import { getDb } from "./db";
import { recordMassageDiscountUsage } from "./massageDiscounts";

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
    originalAmount: massageBookings.originalAmount,
    discountAmount: massageBookings.discountAmount,
    discountCodeId: massageBookings.discountCodeId,
    discountCode: massageBookings.discountCode,
    getnetRequestId: massageBookings.getnetRequestId,
    techniqueName: massageTechniques.name,
    discountType: discountCodes.discountType,
    discountValue: discountCodes.discountValue,
  })
    .from(massageBookings)
    .leftJoin(massageTechniques, eq(massageBookings.techniqueId, massageTechniques.id))
    .leftJoin(discountCodes, eq(massageBookings.discountCodeId, discountCodes.id))
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
    originalAmount: booking.originalAmount ?? booking.amountPaid ?? "0",
    discountAmount: booking.discountAmount ?? "0",
    discountCodeId: booking.discountCodeId,
    discountCode: booking.discountCode,
    discountType: booking.discountType,
    discountValue: booking.discountValue,
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
      originalAmount: sale.originalAmount,
      discountAmount: sale.discountAmount,
      discountCodeId: sale.discountCodeId,
      discountCode: sale.discountCode,
      discountType: sale.discountType,
      discountValue: sale.discountValue,
      paymentMethod: sale.paymentMethod,
      paymentReference: sale.paymentReference,
      status: sale.status,
    },
  });

  if (booking.paymentStatus === "paid" && booking.discountCodeId && booking.getnetRequestId) {
    const [totals] = await db.select({
      originalAmount: sql<string>`COALESCE(SUM(${massageBookings.originalAmount}), 0)`,
      discountAmount: sql<string>`COALESCE(SUM(${massageBookings.discountAmount}), 0)`,
      finalAmount: sql<string>`COALESCE(SUM(${massageBookings.amountPaid}), 0)`,
      email: sql<string | null>`MAX(${massageBookings.clientEmail})`,
    }).from(massageBookings).where(eq(massageBookings.getnetRequestId, booking.getnetRequestId));
    await recordMassageDiscountUsage(db, {
      discountCodeId: booking.discountCodeId,
      requestId: booking.getnetRequestId,
      email: totals?.email,
      originalAmount: Number(totals?.originalAmount ?? 0),
      discountAmount: Number(totals?.discountAmount ?? 0),
      finalAmount: Number(totals?.finalAmount ?? 0),
    });
  }
}
