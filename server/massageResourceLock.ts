import type { RowDataPacket } from "mysql2";
import type { getDb } from "./db";

type MassageDatabase = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const LOCK_TIMEOUT_SECONDS = 15;

export const massageResourceLockKey = (bookingDate: string) =>
  `massage-resources:${bookingDate.slice(0, 10)}`;

/**
 * Serializa las operaciones que eligen o reasignan recursos de masajes para
 * una fecha. El lock es compartido entre todas las instancias del CMS porque
 * vive en MySQL, no solamente en la memoria del proceso Node.
 */
export async function withMassageResourceLocks<T>(
  db: MassageDatabase,
  bookingDates: string[],
  operation: () => Promise<T>,
): Promise<T> {
  const lockKeys = Array.from(new Set(bookingDates.map(massageResourceLockKey))).sort();
  if (lockKeys.length === 0) return operation();

  const connection = await db.$client.promise().getConnection();
  const acquired: string[] = [];
  try {
    for (const lockKey of lockKeys) {
      const [rows] = await connection.query<RowDataPacket[]>(
        "SELECT GET_LOCK(?, ?) AS acquired",
        [lockKey, LOCK_TIMEOUT_SECONDS],
      );
      if (Number(rows[0]?.acquired) !== 1) {
        throw new Error(`No se pudo adquirir el lock de recursos ${lockKey}`);
      }
      acquired.push(lockKey);
    }
    return await operation();
  } finally {
    for (const lockKey of acquired.reverse()) {
      try {
        await connection.query("SELECT RELEASE_LOCK(?)", [lockKey]);
      } catch (error) {
        console.error("[MassageResourceLock] No se pudo liberar el lock:", error);
      }
    }
    connection.release();
  }
}

export async function withMassageResourceLock<T>(
  db: MassageDatabase,
  bookingDate: string,
  operation: () => Promise<T>,
): Promise<T> {
  return withMassageResourceLocks(db, [bookingDate], operation);
}
