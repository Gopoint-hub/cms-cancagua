import { sql } from "drizzle-orm";
import { getDb } from "./db";

const MASSAGE_ASSIGNMENT_PERMISSIONS = JSON.stringify([
  "module.massages",
  "massages.assign_therapists",
]);

function isDuplicateColumnError(error: unknown) {
  const candidate = error as {
    code?: string;
    errno?: number;
    cause?: { code?: string; errno?: number };
  };
  return candidate?.code === "ER_DUP_FIELDNAME"
    || candidate?.errno === 1060
    || candidate?.cause?.code === "ER_DUP_FIELDNAME"
    || candidate?.cause?.errno === 1060;
}

/**
 * Compatibilidad para producción, donde las migraciones se aseguran al iniciar.
 * También habilita de forma idempotente a Bárbara Frías y Daniela Caerols para
 * ver la agenda y asignar terapeutas, sin exponer ventas ni configuración.
 */
export async function ensureUserPermissionsSchema() {
  const db = await getDb();
  if (!db) return;

  try {
    await db.execute(sql.raw(
      "ALTER TABLE `users` ADD COLUMN `permissions` text NULL AFTER `allowedModules`",
    ));
  } catch (error) {
    if (!isDuplicateColumnError(error)) throw error;
  }

  await db.execute(sql`
    UPDATE users
    SET permissions = ${MASSAGE_ASSIGNMENT_PERMISSIONS}
    WHERE (
      LOWER(COALESCE(name, '')) LIKE '%barbara%fri%'
      OR LOWER(COALESCE(name, '')) LIKE '%bárbara%frí%'
      OR LOWER(COALESCE(name, '')) LIKE '%daniela%caerol%'
    )
      AND (
        permissions IS NULL
        OR permissions = ''
        OR permissions = '[]'
      )
  `);

  console.log("[database] Permisos granulares de usuarios verificados");
}
