import { getDb } from "./db";
import { sql } from "drizzle-orm";

export async function ensureMassageNpsSchema(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable while ensuring massage NPS schema");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS massage_nps_responses (
      id int AUTO_INCREMENT NOT NULL,
      booking_type enum('massage','skedu_program') NOT NULL,
      booking_id int NOT NULL,
      survey_token varchar(64) NOT NULL,
      service_name varchar(200) NOT NULL,
      client_name varchar(200) NOT NULL,
      client_phone varchar(30) NOT NULL,
      service_date date NOT NULL,
      end_time varchar(5) NOT NULL,
      scheduled_send_at timestamp NOT NULL,
      delivery_status enum('pending','sending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
      attempt_count int NOT NULL DEFAULT 0,
      last_attempt_at timestamp NULL,
      sent_at timestamp NULL,
      delivery_error text NULL,
      score int NULL,
      comment text NULL,
      responded_at timestamp NULL,
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY massage_nps_survey_token_unique (survey_token),
      UNIQUE KEY massage_nps_booking_unique (booking_type, booking_id)
    )
  `);

  let sourceColumnAdded = false;
  try {
    await db.execute(sql.raw(
      "ALTER TABLE `massage_bookings` ADD COLUMN `booking_source` enum('web','cms') NOT NULL DEFAULT 'cms'",
    ));
    sourceColumnAdded = true;
  } catch (error) {
    const candidate = error as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
    const duplicate = candidate.code === "ER_DUP_FIELDNAME"
      || candidate.errno === 1060
      || candidate.cause?.code === "ER_DUP_FIELDNAME"
      || candidate.cause?.errno === 1060;
    if (!duplicate) throw error;
  }
  if (sourceColumnAdded) {
    await db.execute(sql.raw(
      "UPDATE `massage_bookings` SET `booking_source` = 'web' WHERE `getnet_request_id` IS NOT NULL",
    ));
  }
}
