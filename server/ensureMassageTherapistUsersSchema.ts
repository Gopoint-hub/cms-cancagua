import { sql } from "drizzle-orm";
import { getDb } from "./db";

const addColumnStatements = [
  "ALTER TABLE `massage_therapists` ADD COLUMN `cms_user_id` int",
  "ALTER TABLE `massage_therapists` ADD COLUMN `cms_invitation_email_sent_at` timestamp NULL",
  "ALTER TABLE `massage_therapists` ADD COLUMN `cms_invitation_whatsapp_sent_at` timestamp NULL",
];

function isDuplicateColumnError(error: unknown) {
  const candidate = error as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
  return candidate?.code === "ER_DUP_FIELDNAME"
    || candidate?.errno === 1060
    || candidate?.cause?.code === "ER_DUP_FIELDNAME"
    || candidate?.cause?.errno === 1060;
}

/**
 * Compatibilidad para despliegues que no ejecutan drizzle-kit migrate.
 * Debe ejecutarse antes de crear los usuarios de terapeutas.
 */
export async function ensureMassageTherapistUsersSchema() {
  const db = await getDb();
  if (!db) return;

  await db.execute(sql.raw(`
    ALTER TABLE \`users\`
    MODIFY COLUMN \`role\`
    enum('super_admin','admin','editor','user','seller','concierge','cancagua_staff','massage_therapist')
    NOT NULL DEFAULT 'user'
  `));

  for (const statement of addColumnStatements) {
    try {
      await db.execute(sql.raw(statement));
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
    }
  }

  console.log("[database] Esquema de usuarios terapeutas verificado");
}
