CREATE TABLE `massage_discount_code_techniques` (
  `id` int AUTO_INCREMENT NOT NULL,
  `discount_code_id` int NOT NULL,
  `technique_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `massage_discount_code_techniques_id` PRIMARY KEY(`id`),
  CONSTRAINT `massage_discount_code_techniques_discount_code_id_discount_codes_id_fk`
    FOREIGN KEY (`discount_code_id`) REFERENCES `discount_codes`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `massage_bookings`
  ADD COLUMN `original_amount` decimal(10,2),
  ADD COLUMN `discount_amount` decimal(10,2) DEFAULT 0,
  ADD COLUMN `discount_code_id` int;
--> statement-breakpoint
ALTER TABLE `massage_sales`
  ADD COLUMN `original_amount` decimal(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN `discount_amount` decimal(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN `discount_code_id` int,
  ADD COLUMN `discount_code` varchar(50),
  ADD COLUMN `discount_type` enum('fixed','percentage'),
  ADD COLUMN `discount_value` int;
--> statement-breakpoint
UPDATE `massage_bookings`
SET `original_amount` = `amount_paid`
WHERE `original_amount` IS NULL;
--> statement-breakpoint
UPDATE `massage_sales`
SET `original_amount` = `amount`
WHERE `original_amount` = 0;
