import { sql } from "drizzle-orm";
import { getDb } from "./db";

export async function ensureCashRegisterSchema(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible para Caja efectivo");
  await db.execute(sql.raw(`
    ALTER TABLE massage_bookings
    MODIFY COLUMN manual_payment_method enum(
      'pending_payment','getnet_link','getnet_pos','bank_transfer','cash','gift_card','transbank'
    ) NULL
  `));
  await db.execute(sql.raw(`
    ALTER TABLE massage_program_bookings
    MODIFY COLUMN payment_method enum(
      'pending_payment','getnet_link','getnet_pos','bank_transfer','cash','gift_card','transbank','skedu_program'
    ) NOT NULL DEFAULT 'skedu_program'
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS cash_register_movements (
      id int AUTO_INCREMENT PRIMARY KEY,
      kind enum('manual_income','withdrawal') NOT NULL,
      service varchar(40) NULL,
      amount_clp int NOT NULL,
      category enum('bank_deposit','maintenance','operations','other') NULL,
      reason varchar(500) NOT NULL,
      occurred_at timestamp NOT NULL,
      created_by_user_id int NOT NULL,
      voided_at timestamp NULL,
      voided_by_user_id int NULL,
      void_reason varchar(500) NULL,
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX cash_register_movement_date_idx (occurred_at),
      INDEX cash_register_movement_void_idx (voided_at)
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS cash_register_settings (
      id int PRIMARY KEY,
      opened_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `));
  await db.execute(sql.raw(`
    INSERT IGNORE INTO cash_register_settings (id) VALUES (1)
  `));
  await db.execute(sql.raw(`
    INSERT INTO reservation_payments
      (module, reservation_id, method, status, amount_clp, paid_at, reference, created_by_user_id)
    SELECT
      'massage_programs', b.id, b.payment_method,
      CASE WHEN b.payment_method = 'pending_payment' THEN 'pending' ELSE 'paid' END,
      (CASE WHEN b.duration = 30 THEN 35000 ELSE 45000 END) *
        (CASE WHEN b.modality = 'double' THEN 2 ELSE 1 END),
      CASE WHEN b.payment_method = 'pending_payment' THEN NULL ELSE b.created_at END,
      b.payment_reference, b.created_by_user_id
    FROM massage_program_bookings b
    WHERE NOT EXISTS (
      SELECT 1 FROM reservation_payments p
      WHERE p.module = 'massage_programs' AND p.reservation_id = b.id
    )
  `));
  console.log("[database] Caja efectivo verificada");
}
