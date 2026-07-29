import { sql } from "drizzle-orm";
import { getDb } from "./db";

/**
 * Mantiene completo el libro de ventas aunque una reserva pagada haya sido
 * creada por una versión anterior, un webhook reintentado o una carga manual.
 */
export async function ensureMassageSalesBackfill(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable while backfilling massage sales");

  await db.execute(sql.raw(`
    INSERT INTO massage_sales (
      booking_id,
      sold_at,
      service_date,
      start_time,
      client_name,
      client_email,
      technique_name,
      duration,
      amount,
      original_amount,
      discount_amount,
      discount_code_id,
      discount_code,
      discount_type,
      discount_value,
      payment_method,
      payment_reference,
      status
    )
    SELECT
      booking.id,
      booking.created_at,
      booking.booking_date,
      booking.start_time,
      booking.client_name,
      booking.client_email,
      COALESCE(technique.name, 'Masaje'),
      booking.duration,
      COALESCE(booking.amount_paid, 0),
      COALESCE(booking.original_amount, booking.amount_paid, 0),
      COALESCE(booking.discount_amount, 0),
      booking.discount_code_id,
      booking.discount_code,
      discount.discount_type,
      discount.discount_value,
      CASE
        WHEN booking.getnet_request_id IS NOT NULL THEN 'getnet'
        WHEN booking.manual_payment_method IS NOT NULL THEN booking.manual_payment_method
        ELSE 'cms_manual'
      END,
      booking.getnet_request_id,
      CASE WHEN booking.payment_status = 'refunded' THEN 'refunded' ELSE 'paid' END
    FROM massage_bookings booking
    LEFT JOIN massage_techniques technique ON technique.id = booking.technique_id
    LEFT JOIN discount_codes discount ON discount.id = booking.discount_code_id
    WHERE booking.payment_status IN ('paid', 'refunded')
    ON DUPLICATE KEY UPDATE
      service_date = VALUES(service_date),
      start_time = VALUES(start_time),
      client_name = VALUES(client_name),
      client_email = VALUES(client_email),
      technique_name = VALUES(technique_name),
      duration = VALUES(duration),
      amount = VALUES(amount),
      original_amount = VALUES(original_amount),
      discount_amount = VALUES(discount_amount),
      discount_code_id = VALUES(discount_code_id),
      discount_code = VALUES(discount_code),
      discount_type = VALUES(discount_type),
      discount_value = VALUES(discount_value),
      payment_method = VALUES(payment_method),
      payment_reference = VALUES(payment_reference),
      status = VALUES(status)
  `));

  console.log("[database] Libro histórico de ventas de masajes sincronizado");
}
