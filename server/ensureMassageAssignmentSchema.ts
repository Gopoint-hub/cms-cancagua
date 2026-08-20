import { sql } from "drizzle-orm";
import { getDb } from "./db";

const columnDefinitions = [
  "ALTER TABLE `massage_bookings` ADD COLUMN `manual_payment_method` enum('pending_payment','getnet_link','getnet_pos','bank_transfer','cash','gift_card','transbank','discount_code') NULL AFTER `getnet_request_id`",
  "ALTER TABLE `massage_program_bookings` ADD COLUMN `payment_method` enum('pending_payment','getnet_link','getnet_pos','bank_transfer','cash','gift_card','transbank','skedu_program') NOT NULL DEFAULT 'skedu_program' AFTER `external_reference`",
  "ALTER TABLE `massage_program_bookings` ADD COLUMN `payment_reference` varchar(100) NULL AFTER `payment_method`",
] as const;

function isDuplicateColumnError(error: unknown): boolean {
  const candidate = error as {
    code?: string;
    errno?: number;
    cause?: { code?: string; errno?: number };
  };
  return candidate.code === "ER_DUP_FIELDNAME"
    || candidate.errno === 1060
    || candidate.cause?.code === "ER_DUP_FIELDNAME"
    || candidate.cause?.errno === 1060;
}

export async function ensureMassageAssignmentSchema(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable while ensuring therapist assignment schema");

  for (const statement of columnDefinitions) {
    try {
      await db.execute(sql.raw(statement));
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
    }
  }

  await db.execute(sql.raw(`
    ALTER TABLE \`massage_program_bookings\`
    MODIFY COLUMN \`therapist_id\` int NULL,
    MODIFY COLUMN \`status\` enum('pending','confirmed','completed','cancelled','no_show')
    NOT NULL DEFAULT 'pending'
  `));
  await db.execute(sql.raw(`
    ALTER TABLE \`massage_sales\`
    MODIFY COLUMN \`payment_method\`
    enum('getnet','cms_manual','getnet_link','getnet_pos','bank_transfer','cash','gift_card','transbank','discount_code')
    NOT NULL
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS \`massage_therapist_assignment_requests\` (
      \`id\` int AUTO_INCREMENT PRIMARY KEY,
      \`booking_type\` enum('massage','skedu_program') NOT NULL,
      \`booking_id\` int NOT NULL,
      \`slot_index\` int NOT NULL DEFAULT 1,
      \`therapist_id\` int NOT NULL,
      \`token\` varchar(64) NOT NULL UNIQUE,
      \`status\` enum('pending','confirmed','rejected','expired','superseded') NOT NULL DEFAULT 'pending',
      \`expires_at\` timestamp NOT NULL,
      \`responded_at\` timestamp NULL,
      \`attempt_number\` int NOT NULL DEFAULT 1,
      \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY \`assignment_pending_expiry_idx\` (\`status\`, \`expires_at\`),
      KEY \`assignment_booking_slot_idx\` (\`booking_type\`, \`booking_id\`, \`slot_index\`)
    )
  `));

  console.log("[database] Rotación y medios de pago de masajes verificados");
}
