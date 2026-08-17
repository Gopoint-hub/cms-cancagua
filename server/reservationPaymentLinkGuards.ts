import { TRPCError } from "@trpc/server";
import { and, eq, gt, inArray, or, sql } from "drizzle-orm";
import {
  reservationPaymentAllocations,
  reservationPaymentRequests,
} from "../drizzle/schema";

export type LinkedReservationService = "massages" | "massage_programs" | "biopools" | "sauna";

export async function lockReservationPaymentScopes(
  db: any,
  reservations: Array<{ service: LinkedReservationService; reservationId: number }>,
): Promise<void> {
  const lockKeys = [...new Set(reservations.map(item => `${item.service}:${Number(item.reservationId)}`))].sort();
  for (const lockKey of lockKeys) {
    await db.execute(sql`INSERT IGNORE INTO reservation_payment_locks (lock_key) VALUES (${lockKey})`);
    await db.execute(sql`SELECT lock_key FROM reservation_payment_locks WHERE lock_key = ${lockKey} FOR UPDATE`);
  }
}

/**
 * Evita que recepción cambie el saldo o cancele una reserva mientras el
 * cliente está dentro de Getnet/Webpay. No se libera por timeout local: el
 * estado debe resolverse primero contra el proveedor.
 */
export async function assertNoLiveReservationPaymentAttempt(
  db: any,
  service: LinkedReservationService,
  reservationId: number,
): Promise<void> {
  // La fila mutex existe aun cuando todavía no hay un link. Así create y las
  // ediciones del CMS no pueden cruzarse entre la comprobación y la escritura.
  await lockReservationPaymentScopes(db, [{ service, reservationId }]);
  const linked = await db
    .select({ id: reservationPaymentRequests.id, status: reservationPaymentRequests.status, expiresAt: reservationPaymentRequests.expiresAt })
    .from(reservationPaymentAllocations)
    .innerJoin(reservationPaymentRequests, eq(reservationPaymentAllocations.requestId, reservationPaymentRequests.id))
    .where(and(
      eq(reservationPaymentAllocations.service, service),
      eq(reservationPaymentAllocations.reservationId, reservationId),
      inArray(reservationPaymentRequests.status, ["active", "processing", "reconciliation_required"]),
    ))
    .for("update");
  const ids: number[] = [...new Set<number>(linked.map((item: any) => Number(item.id)))].sort((a, b) => a - b);
  for (const id of ids) {
    await db.execute(sql`SELECT id FROM reservation_payment_requests WHERE id = ${id} FOR UPDATE`);
  }
  const reservationTable: Record<LinkedReservationService, string> = {
    massages: "massage_bookings",
    massage_programs: "massage_program_bookings",
    biopools: "biopool_bookings",
    sauna: "sauna_bookings",
  };
  // Mismo orden que start/finalize: request(s) → reserva. Incluso sin request
  // actual, este lock impide que create inserte el link entre la guardia y la
  // mutación financiera cuando ambas viven en una transacción.
  await db.execute(sql.raw(
    `SELECT id FROM ${reservationTable[service]} WHERE id = ${Number(reservationId)} FOR UPDATE`,
  ));
  const now = new Date();
  if (ids.length) {
    await db.update(reservationPaymentRequests).set({ status: "expired" }).where(and(
      inArray(reservationPaymentRequests.id, ids),
      eq(reservationPaymentRequests.status, "active"),
      sql`${reservationPaymentRequests.expiresAt} <= ${now}`,
    ));
  }
  const [stillLinked] = await db.select({ status: reservationPaymentRequests.status })
    .from(reservationPaymentAllocations)
    .innerJoin(reservationPaymentRequests, eq(reservationPaymentAllocations.requestId, reservationPaymentRequests.id))
    .where(and(
      eq(reservationPaymentAllocations.service, service),
      eq(reservationPaymentAllocations.reservationId, reservationId),
      or(
        eq(reservationPaymentRequests.status, "processing"),
        eq(reservationPaymentRequests.status, "reconciliation_required"),
        and(eq(reservationPaymentRequests.status, "active"), gt(reservationPaymentRequests.expiresAt, now)),
      ),
    )).limit(1).for("update");
  if (stillLinked) {
    throw new TRPCError({
      code: "CONFLICT",
      message: stillLinked.status === "reconciliation_required"
        ? "Este pago electrónico quedó en revisión. No modifiques el saldo ni cobres nuevamente hasta conciliarlo"
        : stillLinked.status === "processing"
          ? "El cliente tiene un pago electrónico en curso. Espera su confirmación antes de modificar el saldo o cancelar la reserva"
          : "Esta reserva tiene un link de pago activo. Cancélalo o genera uno nuevo antes de modificar el saldo",
    });
  }
}
