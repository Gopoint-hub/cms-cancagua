ALTER TABLE `biopool_bookings`
  MODIFY COLUMN `payment_status` enum('pending','partially_paid','paid','partially_refunded','refunded') NOT NULL DEFAULT 'pending';

ALTER TABLE `massage_bookings`
  MODIFY COLUMN `payment_status` enum('pending','partially_paid','paid','refunded') NOT NULL DEFAULT 'pending';

ALTER TABLE `sauna_bookings`
  MODIFY COLUMN `payment_status` enum('unknown','pending','partially_paid','paid','partially_refunded','refunded') NOT NULL DEFAULT 'unknown',
  ADD COLUMN `amount_paid_clp` int NOT NULL DEFAULT 0 AFTER `amount_clp`;

CREATE TABLE IF NOT EXISTS `reservation_payments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `module` varchar(40) NOT NULL,
  `reservation_id` int NOT NULL,
  `method` varchar(60) NOT NULL,
  `status` enum('pending','paid','refunded') NOT NULL DEFAULT 'paid',
  `amount_clp` int NOT NULL,
  `paid_at` timestamp NULL,
  `reference` varchar(160),
  `card_type` enum('credit','debit'),
  `gift_card_id` int,
  `created_by_user_id` int,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `reservation_payments_id` PRIMARY KEY(`id`),
  INDEX `reservation_payment_entity_idx` (`module`, `reservation_id`, `created_at`),
  INDEX `reservation_payment_gift_card_idx` (`gift_card_id`)
);
