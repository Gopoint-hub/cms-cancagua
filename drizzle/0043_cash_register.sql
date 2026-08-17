ALTER TABLE `massage_bookings`
  MODIFY COLUMN `manual_payment_method` enum('pending_payment','getnet_link','getnet_pos','bank_transfer','cash','gift_card','transbank') NULL;
ALTER TABLE `massage_program_bookings`
  MODIFY COLUMN `payment_method` enum('pending_payment','getnet_link','getnet_pos','bank_transfer','cash','gift_card','transbank','skedu_program') NOT NULL DEFAULT 'skedu_program';

CREATE TABLE IF NOT EXISTS `cash_register_movements` (
  `id` int AUTO_INCREMENT NOT NULL,
  `kind` enum('manual_income','withdrawal') NOT NULL,
  `service` varchar(40),
  `amount_clp` int NOT NULL,
  `category` enum('bank_deposit','maintenance','operations','other'),
  `reason` varchar(500) NOT NULL,
  `occurred_at` timestamp NOT NULL,
  `created_by_user_id` int NOT NULL,
  `voided_at` timestamp NULL,
  `voided_by_user_id` int,
  `void_reason` varchar(500),
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `cash_register_movements_id` PRIMARY KEY(`id`),
  INDEX `cash_register_movement_date_idx` (`occurred_at`),
  INDEX `cash_register_movement_void_idx` (`voided_at`)
);

CREATE TABLE IF NOT EXISTS `cash_register_settings` (
  `id` int NOT NULL,
  `opened_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `cash_register_settings_id` PRIMARY KEY(`id`)
);
INSERT IGNORE INTO `cash_register_settings` (`id`) VALUES (1);
