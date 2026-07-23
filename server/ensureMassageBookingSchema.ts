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

  console.log("[database] Esquema base de reservas de masajes verificado");
}
