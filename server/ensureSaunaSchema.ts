import { sql } from "drizzle-orm";
import { getDb } from "./db";

const CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS sauna_settings (id int PRIMARY KEY, capacity int NOT NULL DEFAULT 6, duration_minutes int NOT NULL DEFAULT 60, slot_interval_minutes int NOT NULL DEFAULT 30, booking_lead_hours int NOT NULL DEFAULT 2, cancellation_notice_hours int NOT NULL DEFAULT 72, reschedule_notice_hours int NOT NULL DEFAULT 48, max_reschedules int NOT NULL DEFAULT 2, checkout_enabled int NOT NULL DEFAULT 0, schedule_json text NOT NULL, updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS sauna_services (id int AUTO_INCREMENT PRIMARY KEY, skedu_service_uuid varchar(64) NOT NULL UNIQUE, skedu_variant_uuid varchar(64) NULL, name varchar(220) NOT NULL, kind enum('shared','private','staff','program') NOT NULL, party_size int NOT NULL, capacity_used int NOT NULL, price_clp int NOT NULL DEFAULT 0, duration_minutes int NOT NULL DEFAULT 60, interval_minutes int NOT NULL DEFAULT 90, published int NOT NULL DEFAULT 0, raw_json mediumtext NULL, synced_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS sauna_bookings (id int AUTO_INCREMENT PRIMARY KEY, booking_code varchar(40) NOT NULL UNIQUE, skedu_appointment_uuid varchar(64) NULL UNIQUE, skedu_group_uuid varchar(64) NULL, skedu_user_uuid varchar(64) NULL, skedu_service_uuid varchar(64) NULL, service_name varchar(220) NOT NULL, kind enum('shared','private','staff','detox','manual') NOT NULL DEFAULT 'shared', client_name varchar(200) NULL, client_email varchar(320) NULL, client_phone varchar(40) NULL, booking_date date NOT NULL, start_time varchar(5) NOT NULL, end_time varchar(5) NOT NULL, guests int NOT NULL, capacity_used int NOT NULL, is_private int NOT NULL DEFAULT 0, status enum('pending','confirmed','completed','cancelled','no_show') NOT NULL DEFAULT 'confirmed', is_confirmed int NOT NULL DEFAULT 0, payment_status enum('unknown','pending','partially_paid','paid','partially_refunded','refunded') NOT NULL DEFAULT 'unknown', payment_method varchar(60) NULL, payment_reference varchar(160) NULL, amount_clp int NOT NULL DEFAULT 0, amount_paid_clp int NOT NULL DEFAULT 0, source enum('skedu','web','cms','detox') NOT NULL DEFAULT 'cms', origin varchar(40) NULL, reschedule_count int NOT NULL DEFAULT 0, notes text NULL, external_updated_at timestamp NULL, last_synced_at timestamp NULL, cancelled_at timestamp NULL, created_by_user_id int NULL, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX sauna_booking_slot_idx (booking_date, start_time, end_time, status), INDEX sauna_booking_source_idx (source, skedu_service_uuid))`,
  `CREATE TABLE IF NOT EXISTS sauna_blocks (id int AUTO_INCREMENT PRIMARY KEY, block_date date NOT NULL, start_time varchar(5) NOT NULL, end_time varchar(5) NOT NULL, blocked_capacity int NOT NULL DEFAULT 6, reason enum('maintenance','private_event','detox','operational','other') NOT NULL, notes text NULL, active int NOT NULL DEFAULT 1, created_by_user_id int NOT NULL, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX sauna_block_slot_idx (block_date, start_time, end_time, active))`,
  `CREATE TABLE IF NOT EXISTS sauna_program_queue (id int AUTO_INCREMENT PRIMARY KEY, skedu_appointment_uuid varchar(64) NOT NULL UNIQUE, skedu_group_uuid varchar(64) NULL, skedu_user_uuid varchar(64) NULL, skedu_service_uuid varchar(64) NULL, service_name varchar(240) NOT NULL, variant_name varchar(240) NULL, program_starts_at timestamp NOT NULL, guests int NOT NULL, client_name varchar(200) NULL, client_email varchar(320) NULL, client_phone varchar(40) NULL, status enum('pending','scheduled','dismissed','cancelled') NOT NULL DEFAULT 'pending', sauna_booking_id int NULL, last_synced_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX sauna_program_status_idx (status, program_starts_at))`,
  `CREATE TABLE IF NOT EXISTS sauna_sync_runs (id int AUTO_INCREMENT PRIMARY KEY, status enum('running','completed','failed') NOT NULL DEFAULT 'running', range_from date NOT NULL, range_to date NOT NULL, appointments_read int NOT NULL DEFAULT 0, bookings_upserted int NOT NULL DEFAULT 0, programs_queued int NOT NULL DEFAULT 0, error text NULL, started_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at timestamp NULL)`,
  `CREATE TABLE IF NOT EXISTS sauna_checkout_orders (id int AUTO_INCREMENT PRIMARY KEY, public_token varchar(64) NOT NULL UNIQUE, booking_id int NULL, service_id int NOT NULL, client_name varchar(200) NOT NULL, client_email varchar(320) NOT NULL, client_phone varchar(40) NOT NULL, booking_date date NOT NULL, start_time varchar(5) NOT NULL, end_time varchar(5) NOT NULL, guests int NOT NULL, capacity_used int NOT NULL, is_private int NOT NULL DEFAULT 0, total_clp int NOT NULL, status enum('initiating','payment_pending','paid','rejected','aborted','expired','failed','refunded','manual_review') NOT NULL DEFAULT 'initiating', expires_at timestamp NOT NULL, webpay_token varchar(180) NULL UNIQUE, buy_order varchar(26) NULL UNIQUE, session_id varchar(61) NULL, webpay_status varchar(40) NULL, response_code int NULL, authorization_code varchar(80) NULL, card_number varchar(40) NULL, payment_type_code varchar(10) NULL, transaction_date varchar(60) NULL, raw_response mediumtext NULL, error text NULL, paid_at timestamp NULL, completed_at timestamp NULL, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX sauna_checkout_hold_idx (booking_date, start_time, status, expires_at), INDEX sauna_checkout_booking_idx (booking_id))`,
];

const DEFAULT_SCHEDULE = JSON.stringify({
  0: { enabled: true, open: "10:30", close: "21:30" },
  1: { enabled: false, open: null, close: null },
  2: { enabled: true, open: "10:00", close: "22:00" },
  3: { enabled: true, open: "10:00", close: "22:00" },
  4: { enabled: true, open: "10:00", close: "22:00" },
  5: { enabled: true, open: "10:00", close: "22:00" },
  6: { enabled: true, open: "10:30", close: "21:30" },
});

export async function ensureSaunaSchema(): Promise<void> {
  const db = await getDb();
  if (!db)
    throw new Error("Base de datos no disponible para inicializar Sauna");
  for (const statement of CREATE_STATEMENTS) {
    await db.execute(sql.raw(statement));
  }
  const [columns] = await db.execute(sql`SHOW COLUMNS FROM sauna_bookings`);
  if (
    !(columns as unknown as any[]).some(
      column => column.Field === "amount_paid_clp"
    )
  ) {
    await db.execute(
      sql`ALTER TABLE sauna_bookings ADD COLUMN amount_paid_clp int NOT NULL DEFAULT 0 AFTER amount_clp`
    );
  }
  await db.execute(
    sql.raw(
      "ALTER TABLE `sauna_bookings` MODIFY COLUMN `payment_status` enum('unknown','pending','partially_paid','paid','partially_refunded','refunded') NOT NULL DEFAULT 'unknown'"
    )
  );
  await db.execute(
    sql.raw(
      "ALTER TABLE `sauna_checkout_orders` MODIFY COLUMN `status` enum('initiating','payment_pending','paid','rejected','aborted','expired','failed','refunded','manual_review') NOT NULL DEFAULT 'initiating'"
    )
  );
  await db.execute(
    sql`INSERT INTO sauna_settings (id, schedule_json) VALUES (1, ${DEFAULT_SCHEDULE}) ON DUPLICATE KEY UPDATE id = id`
  );
  console.log("[database] Módulo Sauna verificado");
}
