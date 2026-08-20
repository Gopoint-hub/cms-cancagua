import { sql } from "drizzle-orm";
import { getDb } from "./db";

function isDuplicateColumnError(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current: unknown = error;
  while (current && !visited.has(current)) {
    visited.add(current);
    if (typeof current !== "object") return String(current).toLowerCase().includes("duplicate column");
    const record = current as Record<string, unknown>;
    if (record.code === "ER_DUP_FIELDNAME" || record.errno === 1060) return true;
    const details = [record.message, record.sqlMessage].filter(value => typeof value === "string").join(" ").toLowerCase();
    if (details.includes("duplicate column")) return true;
    current = record.cause;
  }
  return false;
}

export async function ensureMassageCatalogSchema(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable while ensuring massage catalog schema");

  for (const statement of [
    "ALTER TABLE `massage_techniques` ADD COLUMN `monthly_only` int NOT NULL DEFAULT 0 AFTER `price_110min`",
    "ALTER TABLE `massage_techniques` ADD COLUMN `monthly_feature_month` varchar(7) NULL AFTER `monthly_only`",
  ]) {
    try {
      await db.execute(sql.raw(statement));
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
    }
  }

  // Configuración inicial solicitada para agosto. El guard permite que futuras
  // ediciones hechas desde Técnicas no se sobrescriban en cada arranque.
  await db.execute(sql.raw(`
    UPDATE massage_techniques
    SET monthly_only = 1,
        monthly_feature_month = '2026-08'
    WHERE id = 150002
      AND monthly_feature_month IS NULL
  `));

  console.log("[database] Catálogo mensual de masajes verificado");
}
