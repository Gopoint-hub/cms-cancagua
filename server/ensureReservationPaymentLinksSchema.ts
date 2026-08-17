import { sql } from "drizzle-orm";
import { getDb } from "./db";

const statements = [
  `CREATE TABLE IF NOT EXISTS reservation_payment_locks (
    lock_key varchar(100) PRIMARY KEY,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS reservation_payment_requests (
    id int AUTO_INCREMENT PRIMARY KEY,
    public_token varchar(64) NOT NULL UNIQUE,
    provider enum('getnet','webpay') NOT NULL,
    status enum('active','processing','paid','cancelled','expired','failed','reconciliation_required') NOT NULL DEFAULT 'active',
    total_clp int NOT NULL,
    client_name varchar(200) NOT NULL,
    client_email varchar(320) NULL,
    client_phone varchar(40) NULL,
    expires_at timestamp NOT NULL,
    paid_at timestamp NULL,
    cancelled_at timestamp NULL,
    reconciliation_reason text NULL,
    created_by_user_id int NOT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX reservation_payment_request_status_idx (status, expires_at)
  )`,
  `CREATE TABLE IF NOT EXISTS reservation_payment_allocations (
    id int AUTO_INCREMENT PRIMARY KEY,
    request_id int NOT NULL,
    service enum('massages','massage_programs','biopools','sauna') NOT NULL,
    reservation_id int NOT NULL,
    amount_clp int NOT NULL,
    payment_id int NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY reservation_payment_allocation_unique (request_id, service, reservation_id),
    INDEX reservation_payment_allocation_reservation_idx (service, reservation_id),
    INDEX reservation_payment_allocation_payment_idx (payment_id)
  )`,
  `CREATE TABLE IF NOT EXISTS reservation_payment_attempts (
    id int AUTO_INCREMENT PRIMARY KEY,
    request_id int NOT NULL,
    provider enum('getnet','webpay') NOT NULL,
    status enum('initiating','pending','approved','rejected','aborted','expired','failed','reconciliation_required') NOT NULL DEFAULT 'initiating',
    reference varchar(80) NOT NULL UNIQUE,
    expected_amount_clp int NOT NULL,
    provider_request_id varchar(80) NULL UNIQUE,
    webpay_token varchar(180) NULL UNIQUE,
    provider_url text NULL,
    reported_amount_clp int NULL,
    reported_currency varchar(10) NULL,
    provider_status varchar(40) NULL,
    authorization_code varchar(80) NULL,
    raw_response mediumtext NULL,
    error text NULL,
    expires_at timestamp NOT NULL,
    completed_at timestamp NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX reservation_payment_attempt_request_idx (request_id, status)
  )`,
] as const;

export async function ensureReservationPaymentLinksSchema(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible para links de pago");
  for (const statement of statements) await db.execute(sql.raw(statement));
  console.log("[database] Links de pago de reservas verificados");
}
