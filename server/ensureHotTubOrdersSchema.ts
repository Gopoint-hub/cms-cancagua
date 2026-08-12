import { sql } from "drizzle-orm";
import { getDb } from "./db";

function duplicateColumn(error: unknown): boolean {
  const candidate = error as {
    code?: string;
    errno?: number;
    cause?: { code?: string; errno?: number };
  };
  return (
    candidate.code === "ER_DUP_FIELDNAME" ||
    candidate.errno === 1060 ||
    candidate.cause?.code === "ER_DUP_FIELDNAME" ||
    candidate.cause?.errno === 1060
  );
}

export async function ensureHotTubOrdersSchema(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible para Carta Hot Tub");

  for (const statement of [
    "ALTER TABLE `hot_tub_orders` ADD COLUMN `identification_type` enum('hot_tub','key_fob') NOT NULL DEFAULT 'hot_tub' AFTER `customer_phone`",
    "ALTER TABLE `hot_tub_orders` ADD COLUMN `key_fob_number` varchar(20) NULL AFTER `hot_tub_code`",
  ]) {
    try {
      await db.execute(sql.raw(statement));
    } catch (error) {
      if (!duplicateColumn(error)) throw error;
    }
  }
  await db.execute(
    sql.raw(
      "ALTER TABLE `hot_tub_orders` MODIFY COLUMN `hot_tub_code` enum('1006','1005','1004','1003','1002','1001') NULL",
    ),
  );
  console.log("[database] Identificación Carta Hot Tub verificada");
}
