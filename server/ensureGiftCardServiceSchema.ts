import { sql } from "drizzle-orm";
import { getDb } from "./db";

function duplicateColumn(error: unknown): boolean {
  const item = error as {
    code?: string;
    errno?: number;
    cause?: { code?: string; errno?: number };
  };
  return (
    item.code === "ER_DUP_FIELDNAME" ||
    item.errno === 1060 ||
    item.cause?.code === "ER_DUP_FIELDNAME" ||
    item.cause?.errno === 1060
  );
}

export async function ensureGiftCardServiceSchema(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible para Gift Cards");
  for (const statement of [
    "ALTER TABLE `gift_cards` ADD COLUMN `redemption_mode` varchar(20) NOT NULL DEFAULT 'amount' AFTER `balance`",
    "ALTER TABLE `gift_cards` ADD COLUMN `service_key` varchar(80) NULL AFTER `redemption_mode`",
    "ALTER TABLE `gift_cards` ADD COLUMN `service_name` varchar(200) NULL AFTER `service_key`",
    "ALTER TABLE `gift_cards` ADD COLUMN `service_payload` text NULL AFTER `service_name`",
    "ALTER TABLE `biopool_checkout_orders` ADD COLUMN `gift_card_code` varchar(20) NULL AFTER `discount_code`",
    "ALTER TABLE `sauna_checkout_orders` ADD COLUMN `gift_card_code` varchar(20) NULL AFTER `total_clp`",
  ]) {
    try {
      await db.execute(sql.raw(statement));
    } catch (error) {
      if (!duplicateColumn(error)) throw error;
    }
  }
  await db.execute(
    sql.raw(
      `UPDATE gift_cards SET redemption_mode = 'service' WHERE amount = 0`
    )
  );
  await db.execute(
    sql.raw(`UPDATE gift_cards SET service_key = CASE
    WHEN LOWER(COALESCE(personal_message,'')) LIKE '%reconecta%' THEN 'mixed_program'
    WHEN ((LOWER(COALESCE(personal_message,'')) LIKE '%biopisc%')
      + (LOWER(COALESCE(personal_message,'')) LIKE '%masaje%')
      + (LOWER(COALESCE(personal_message,'')) LIKE '%sauna%')
      + (LOWER(COALESCE(personal_message,'')) LIKE '%hot tub%')
      + (LOWER(COALESCE(personal_message,'')) REGEXP 'clase|yoga|pilates')) > 1 THEN 'mixed_program'
    WHEN LOWER(COALESCE(personal_message,'')) LIKE '%masaje%' THEN 'massages'
    WHEN LOWER(COALESCE(personal_message,'')) LIKE '%sauna%' THEN 'sauna'
    WHEN LOWER(COALESCE(personal_message,'')) LIKE '%hot tub%' THEN 'hot_tubs'
    WHEN LOWER(COALESCE(personal_message,'')) REGEXP 'clase|yoga|pilates' THEN 'regular_classes'
    WHEN LOWER(COALESCE(personal_message,'')) LIKE '%biopisc%' THEN 'biopools'
    ELSE service_key END
    WHERE redemption_mode = 'service' AND service_key IS NULL`)
  );
  await db.execute(
    sql.raw(`UPDATE gift_cards SET service_name = CASE service_key
    WHEN 'biopools' THEN 'Biopiscinas'
    WHEN 'massages' THEN 'Masajes'
    WHEN 'sauna' THEN 'Sauna'
    WHEN 'regular_classes' THEN 'Clases Regulares'
    WHEN 'hot_tubs' THEN 'Hot Tubs'
    WHEN 'mixed_program' THEN 'Programa mixto'
    ELSE service_name END
    WHERE redemption_mode = 'service' AND service_name IS NULL`)
  );
  console.log("[database] Gift Cards por servicio verificadas");
}
