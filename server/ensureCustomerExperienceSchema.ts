import { sql } from "drizzle-orm";
import { getDb } from "./db";

export function isDuplicateColumnError(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current: unknown = error;

  while (current && !visited.has(current)) {
    visited.add(current);

    if (typeof current === "object") {
      const record = current as Record<string, unknown>;
      if (record.code === "ER_DUP_FIELDNAME" || record.errno === 1060) return true;

      const details = [record.message, record.sqlMessage]
        .filter((value): value is string => typeof value === "string")
        .join(" ")
        .toLowerCase();
      if (details.includes("duplicate column")) return true;

      current = record.cause;
      continue;
    }

    if (String(current).toLowerCase().includes("duplicate column")) return true;
    break;
  }

  return false;
}

async function addColumnIfMissing(db: any, statement: string) {
  try {
    await db.execute(sql.raw(statement));
  } catch (error) {
    if (!isDuplicateColumnError(error)) throw error;
  }
}

export async function ensureCustomerExperienceSchema() {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS customer_purchase_surveys (
      id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
      purchase_type varchar(50) NOT NULL,
      purchase_id varchar(100) NOT NULL,
      client_email varchar(320) NULL,
      discovery_source enum('advertising','facebook','instagram','google','friends_family','other') NOT NULL,
      discovery_source_other varchar(160) NULL,
      origin_type enum('chile','foreign') NOT NULL,
      country varchar(120) NULL,
      region varchar(160) NULL,
      city varchar(160) NULL,
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX cps_purchase_idx (purchase_type, purchase_id),
      INDEX cps_created_idx (created_at)
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS service_cart_notifications (
      id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
      cart_order_id int NOT NULL,
      type enum('confirmation') NOT NULL DEFAULT 'confirmation',
      channel enum('email') NOT NULL DEFAULT 'email',
      status enum('pending','sending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
      scheduled_at timestamp NULL,
      sent_at timestamp NULL,
      provider_id varchar(180) NULL,
      error text NULL,
      attempt_count int NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY scn_order_channel_unique (cart_order_id, type, channel),
      INDEX scn_queue_idx (status, scheduled_at)
    )
  `));
  await addColumnIfMissing(db, "ALTER TABLE discount_codes ADD COLUMN booking_valid_from date NULL AFTER expires_at");
  await addColumnIfMissing(db, "ALTER TABLE discount_codes ADD COLUMN booking_valid_until date NULL AFTER booking_valid_from");
}
