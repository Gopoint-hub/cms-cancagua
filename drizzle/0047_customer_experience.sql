CREATE TABLE IF NOT EXISTS `customer_purchase_surveys` (
  `id` int AUTO_INCREMENT NOT NULL,
  `purchase_type` varchar(50) NOT NULL,
  `purchase_id` varchar(100) NOT NULL,
  `client_email` varchar(320),
  `discovery_source` enum('advertising','facebook','instagram','google','friends_family','other') NOT NULL,
  `discovery_source_other` varchar(160),
  `origin_type` enum('chile','foreign') NOT NULL,
  `country` varchar(120),
  `region` varchar(160),
  `city` varchar(160),
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `customer_purchase_surveys_id` PRIMARY KEY(`id`),
  INDEX `cps_purchase_idx` (`purchase_type`, `purchase_id`),
  INDEX `cps_created_idx` (`created_at`)
);

CREATE TABLE IF NOT EXISTS `service_cart_notifications` (
  `id` int AUTO_INCREMENT NOT NULL,
  `cart_order_id` int NOT NULL,
  `type` enum('confirmation') NOT NULL DEFAULT 'confirmation',
  `channel` enum('email') NOT NULL DEFAULT 'email',
  `status` enum('pending','sending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
  `scheduled_at` timestamp,
  `sent_at` timestamp,
  `provider_id` varchar(180),
  `error` text,
  `attempt_count` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `service_cart_notifications_id` PRIMARY KEY(`id`),
  CONSTRAINT `scn_order_channel_unique` UNIQUE(`cart_order_id`, `type`, `channel`),
  INDEX `scn_queue_idx` (`status`, `scheduled_at`)
);

ALTER TABLE `discount_codes` ADD COLUMN `booking_valid_from` date NULL AFTER `expires_at`;
ALTER TABLE `discount_codes` ADD COLUMN `booking_valid_until` date NULL AFTER `booking_valid_from`;
