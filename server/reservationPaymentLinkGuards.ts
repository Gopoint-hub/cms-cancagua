import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  reservationPaymentAllocations,
  reservationPaymentRequests,
  reservationPayments,
} from "../drizzle/schema";

export type LinkedReservationService =
  | "massages"
  | "massage_programs"
  | "biopools"
  | "sauna";

export const RESERVATION_PAYMENT_TRANSACTION = {
  isolationLevel: "read committed" as const,
};

export async function lockReservationPaymentScopes(
  db: any,
  reservations: Array<{
    service: LinkedReservationService;
    reservationId: number;
  }>
): Promise<void> {
  const lockKeys = [
    ...new Set(
      reservations.map(item => `${item.service}:${Number(item.reservationId)}`)
    ),
  ].sort();
  for (const lockKey of lockKeys) {
    await db.execute(
      sql`INSERT IGNORE INTO reservation_payment_locks (lock_key) VALUES (${lockKey})`
    );
    await db.execute(
      sql`SELECT lock_key FROM reservation_payment_locks WHERE lock_key = ${lockKey} FOR UPDATE`
    );
  }
}

/**
 * Vence una solicitud activa y libera únicamente los placeholders pendientes
 * creados para ella. También repara solicitudes que ya estaban marcadas como
 * vencidas por una versión anterior pero conservaron el placeholder. Debe
 * ejecutarse dentro de una transacción: el bloqueo de la solicitud evita
 * borrar el placeholder si, al mismo tiempo, el cliente alcanzó a iniciar el
 * pago y el request pasó a `processing`.
 */
export async function expireActiveReservationPaymentRequest(
  tx: any,
  requestId: number,
  now = new Date()
): Promise<boolean> {
  let [request] = await tx
    .select({
      status: reservationPaymentRequests.status,
      expiresAt: reservationPaymentRequests.expiresAt,
    })
    .from(reservationPaymentRequests)
    .where(eq(reservationPaymentRequests.id, requestId))
    .limit(1)
    .for("update");
  if (!request) {
    return false;
  }
  if (request.status === "active") {
    if (request.expiresAt.getTime() > now.getTime()) return false;
    const updateResult = await tx
      .update(reservationPaymentRequests)
      .set({ status: "expired" })
      .where(
        and(
          eq(reservationPaymentRequests.id, requestId),
          eq(reservationPaymentRequests.status, "active")
        )
      );
    const affectedRows = Number(
      (updateResult as any)?.[0]?.affectedRows ??
        (updateResult as any)?.affectedRows ??
        0
    );
    if (affectedRows !== 1) {
      [request] = await tx
        .select({
          status: reservationPaymentRequests.status,
          expiresAt: reservationPaymentRequests.expiresAt,
        })
        .from(reservationPaymentRequests)
        .where(eq(reservationPaymentRequests.id, requestId))
        .limit(1)
        .for("update");
      if (request?.status !== "expired") return false;
    }
  } else if (request.status !== "expired") {
    return false;
  }
  const allocations = await tx
    .select({ paymentId: reservationPaymentAllocations.paymentId })
    .from(reservationPaymentAllocations)
    .where(eq(reservationPaymentAllocations.requestId, requestId))
    .for("update");
  const paymentIds: number[] = [
    ...new Set<number>(
      allocations
        .map((allocation: any) => allocation.paymentId)
        .filter((id: unknown): id is number => typeof id === "number")
    ),
  ];
  if (paymentIds.length) {
    await tx
      .delete(reservationPayments)
      .where(
        and(
          inArray(reservationPayments.id, paymentIds),
          eq(reservationPayments.status, "pending")
        )
      );
  }
  return true;
}

/**
 * Evita que recepción cambie el saldo o cancele una reserva mientras el
 * cliente está dentro de Getnet/Webpay. No se libera por timeout local: el
 * estado debe resolverse primero contra el proveedor.
 */
export async function assertNoLiveReservationPaymentAttempt(
  db: any,
  service: LinkedReservationService,
  reservationId: number
): Promise<void> {
  // La fila mutex existe aun cuando todavía no hay un link. Así create y las
  // ediciones del CMS no pueden cruzarse entre la comprobación y la escritura.
  await lockReservationPaymentScopes(db, [{ service, reservationId }]);
  // Es un current-read aun si el caller ya abrió un snapshot RR antes de
  // esperar el mutex. `OF reservation_payment_requests` evita bloquear las
  // allocations/payments del JOIN y conserva el orden request → payment.
  const discoveryResult = await db.execute(sql`
    SELECT
      reservation_payment_requests.id,
      reservation_payment_requests.status,
      reservation_payment_requests.expires_at AS expiresAt
    FROM reservation_payment_requests
    INNER JOIN reservation_payment_allocations
      ON reservation_payment_allocations.request_id = reservation_payment_requests.id
    LEFT JOIN reservation_payments
      ON reservation_payments.id = reservation_payment_allocations.payment_id
    WHERE reservation_payment_allocations.service = ${service}
      AND reservation_payment_allocations.reservation_id = ${reservationId}
      AND (
        reservation_payment_requests.status IN ('active', 'processing', 'reconciliation_required')
        OR (
          reservation_payment_requests.status = 'expired'
          AND reservation_payments.status = 'pending'
        )
      )
    ORDER BY reservation_payment_requests.id
    FOR UPDATE OF reservation_payment_requests
  `);
  const discoveredRows = Array.isArray((discoveryResult as any)?.[0])
    ? (discoveryResult as any)[0]
    : [];
  const discoveredById = new Map<
    number,
    {
      id: number;
      status: string;
      expiresAt: Date;
    }
  >();
  for (const row of discoveredRows) {
    discoveredById.set(Number(row.id), {
      id: Number(row.id),
      status: String(row.status),
      expiresAt:
        row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt),
    });
  }
  const currentRequests: Array<{
    id: number;
    status: string;
    expiresAt: Date;
  }> = [...discoveredById.values()].sort((a, b) => a.id - b.id);
  const reservationTable: Record<LinkedReservationService, string> = {
    massages: "massage_bookings",
    massage_programs: "massage_program_bookings",
    biopools: "biopool_bookings",
    sauna: "sauna_bookings",
  };
  // Mismo orden que start/finalize: request(s) → reserva. Incluso sin request
  // actual, este lock impide que create inserte el link entre la guardia y la
  // mutación financiera cuando ambas viven en una transacción.
  await db.execute(
    sql.raw(
      `SELECT id FROM ${reservationTable[service]} WHERE id = ${Number(reservationId)} FOR UPDATE`
    )
  );
  // El reloj se toma después de esperar los locks: un link que venció durante
  // la espera no vuelve a considerarse vigente.
  const now = new Date();
  for (const request of currentRequests) {
    if (
      request.status === "expired" ||
      (request.status === "active" &&
        request.expiresAt.getTime() <= now.getTime())
    ) {
      await expireActiveReservationPaymentRequest(db, request.id, now);
    }
  }
  const stillLinked = currentRequests.find(
    request =>
      request.status === "processing" ||
      request.status === "reconciliation_required" ||
      (request.status === "active" &&
        request.expiresAt.getTime() > now.getTime())
  );
  if (stillLinked) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        stillLinked.status === "reconciliation_required"
          ? "Este pago electrónico quedó en revisión. No modifiques el saldo ni cobres nuevamente hasta conciliarlo"
          : stillLinked.status === "processing"
            ? "El cliente tiene un pago electrónico en curso. Espera su confirmación antes de modificar el saldo o cancelar la reserva"
            : "Esta reserva tiene un link de pago activo. Cancélalo o genera uno nuevo antes de modificar el saldo",
    });
  }
}
