import { sql } from "drizzle-orm";
import { getDb } from "./db";

const bookingColumns = [
  "ADD COLUMN `getnet_request_id` varchar(64)",
  "ADD COLUMN `booking_source` enum('web','cms') NOT NULL DEFAULT 'cms'",
  "ADD COLUMN `freelance_approval_status` varchar(30)",
  "ADD COLUMN `admin_approval_token` varchar(64)",
  "ADD COLUMN `therapist_confirmation_token` varchar(64)",
  "ADD COLUMN `original_amount` decimal(10,2)",
  "ADD COLUMN `discount_amount` decimal(10,2) DEFAULT 0",
  "ADD COLUMN `discount_code_id` int",
  "ADD COLUMN `cancellation_category` varchar(50)",
  "ADD COLUMN `cancellation_reason` text",
  "ADD COLUMN `cancelled_at` timestamp NULL",
  "ADD COLUMN `cancelled_by_user_id` int",
  "ADD COLUMN `couple_booking_id` int",
] as const;

function isDuplicateColumnError(error: unknown): boolean {
  const candidate = error as {
    code?: string;
    errno?: number;
    cause?: { code?: string; errno?: number };
  };
  return candidate.code === "ER_DUP_FIELDNAME"
    || candidate.errno === 1060
    || candidate.cause?.code === "ER_DUP_FIELDNAME"
    || candidate.cause?.errno === 1060;
}

/**
 * Mantiene compatible la tabla durante despliegues graduales, cuando una
 * instancia anterior y una nueva pueden atender tráfico al mismo tiempo.
 */
export async function ensureMassageBookingSchema(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable while ensuring massage booking schema");

  for (const definition of bookingColumns) {
    try {
      await db.execute(sql.raw(`ALTER TABLE \`massage_bookings\` ${definition}`));
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
    }
  }

  // El DEFAULT permite que una instancia anterior, que todavía no conoce
  // booking_source, siga insertando reservas durante el rolling deploy.
  await db.execute(sql.raw(
    "ALTER TABLE `massage_bookings` MODIFY COLUMN `booking_source` enum('web','cms') NOT NULL DEFAULT 'cms'",
  ));
  await db.execute(sql.raw(
    "UPDATE `massage_bookings` SET `booking_source` = 'web' WHERE `getnet_request_id` IS NOT NULL",
  ));

  // Entre el 15 y el 23 de julio de 2026, la limpieza de asignaciones
  // pendientes alcanzó por error reservas manuales pagadas que sí tenían
  // terapeuta. Se restauran como completadas porque su fecha ya había pasado.
  await db.execute(sql.raw(`
    UPDATE massage_bookings
    SET status = 'completed',
        cancellation_category = NULL,
        cancellation_reason = NULL,
        cancelled_at = NULL,
        cancelled_by_user_id = NULL,
        freelance_approval_status = NULL
    WHERE booking_source = 'cms'
      AND payment_status = 'paid'
      AND therapist_id IS NOT NULL
      AND status = 'cancelled'
      AND cancellation_category = 'system'
      AND cancellation_reason = 'Reserva vencida sin asignación manual.'
  `));

  console.log("[database] Esquema base de reservas de masajes verificado");
}
