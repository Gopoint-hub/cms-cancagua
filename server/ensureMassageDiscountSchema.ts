import { sql } from "drizzle-orm";
import { getDb } from "./db";

const addColumnStatements = [
  "ALTER TABLE `massage_bookings` ADD COLUMN `original_amount` decimal(10,2)",
  "ALTER TABLE `massage_bookings` ADD COLUMN `discount_amount` decimal(10,2) DEFAULT 0",
  "ALTER TABLE `massage_bookings` ADD COLUMN `discount_code_id` int",
  "ALTER TABLE `massage_sales` ADD COLUMN `original_amount` decimal(10,2) NOT NULL DEFAULT 0",
  "ALTER TABLE `massage_sales` ADD COLUMN `discount_amount` decimal(10,2) NOT NULL DEFAULT 0",
  "ALTER TABLE `massage_sales` ADD COLUMN `discount_code_id` int",
  "ALTER TABLE `massage_sales` ADD COLUMN `discount_code` varchar(50)",
  "ALTER TABLE `massage_sales` ADD COLUMN `discount_type` enum('fixed','percentage')",
  "ALTER TABLE `massage_sales` ADD COLUMN `discount_value` int",
];

const isDuplicateColumnError = (error: unknown) => {
  const candidate = error as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
  return candidate?.code === "ER_DUP_FIELDNAME"
    || candidate?.errno === 1060
    || candidate?.cause?.code === "ER_DUP_FIELDNAME"
    || candidate?.cause?.errno === 1060;
};

/**
 * Compatibilidad para despliegues que no ejecutan drizzle-kit migrate.
 * Es idempotente y corre antes de aceptar tráfico.
 */
export async function ensureMassageDiscountSchema() {
  const db = await getDb();
  if (!db) return;

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS \`massage_discount_code_techniques\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`discount_code_id\` int NOT NULL,
      \`technique_id\` int NOT NULL,
      \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      CONSTRAINT \`mdct_discount_code_fk\`
        FOREIGN KEY (\`discount_code_id\`) REFERENCES \`discount_codes\`(\`id\`) ON DELETE CASCADE
    )
  `));

  for (const statement of addColumnStatements) {
    try {
      await db.execute(sql.raw(statement));
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
    }
  }

  await db.execute(sql.raw(`
    UPDATE \`massage_bookings\`
    SET \`original_amount\` = \`amount_paid\`
    WHERE \`original_amount\` IS NULL
  `));
  await db.execute(sql.raw(`
    UPDATE \`massage_sales\`
    SET \`original_amount\` = \`amount\`
    WHERE \`original_amount\` = 0
  `));
  await db.execute(sql.raw(`
    UPDATE \`massage_rooms\`
    SET \`allow_couple_booking\` = 1
    WHERE \`type\` = 'double'
  `));

  console.log("[database] Esquema de descuentos de masajes verificado");
}
