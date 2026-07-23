import { sql } from "drizzle-orm";
import { getDb } from "./db";

const isDuplicateColumnError = (error: unknown) => {
  const candidate = error as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
  return candidate?.code === "ER_DUP_FIELDNAME"
    || candidate?.errno === 1060
    || candidate?.cause?.code === "ER_DUP_FIELDNAME"
    || candidate?.cause?.errno === 1060;
};

/**
 * Compatibilidad para despliegues que no ejecutan drizzle-kit migrate.
 * Debe ejecutarse antes de aceptar tráfico.
 */
export async function ensureMassageAvailabilitySchema() {
  const db = await getDb();
  if (!db) return;

  let generationSourceAdded = false;
  try {
    await db.execute(sql.raw(
      "ALTER TABLE `massage_therapist_availability` ADD COLUMN `generation_source` varchar(30)",
    ));
    generationSourceAdded = true;
  } catch (error) {
    if (!isDuplicateColumnError(error)) throw error;
  }

  if (generationSourceAdded) {
    await db.execute(sql.raw(`
      UPDATE \`massage_therapist_schedules\`
      SET \`available\` = 1
      WHERE \`block_from\` IS NOT NULL
        AND \`block_to\` IS NOT NULL
    `));
  }

  console.log("[database] Esquema de disponibilidad recurrente de masajes verificado");
}
