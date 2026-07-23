CREATE TABLE IF NOT EXISTS `massage_monthly_closures` (
  `id` int AUTO_INCREMENT NOT NULL,
  `close_month` varchar(7) NOT NULL,
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `status` enum('draft','closed') NOT NULL DEFAULT 'draft',
  `supply_unit_cost` decimal(12,2) NOT NULL DEFAULT 707,
  `laundry_unit_cost` decimal(12,2) NOT NULL DEFAULT 3103.80,
  `regular_transport_cost` decimal(12,2) NOT NULL DEFAULT 398000,
  `freelance_trip_unit_cost` decimal(12,2) NOT NULL DEFAULT 5000,
  `freelance_trip_count` int NOT NULL DEFAULT 0,
  `electricity_cost` decimal(12,2) NOT NULL DEFAULT 123573,
  `accounting_cost` decimal(12,2) NOT NULL DEFAULT 63333,
  `tamara_base_salary` decimal(12,2) NOT NULL DEFAULT 811261,
  `barbara_base_salary` decimal(12,2) NULL,
  `daniela_base_salary` decimal(12,2) NULL,
  `previred_rate` decimal(6,4) NOT NULL DEFAULT 0.2000,
  `freelance_commission_rate` decimal(6,4) NOT NULL DEFAULT 0.5000,
  `inhouse_commission_rate` decimal(6,4) NOT NULL DEFAULT 0.2000,
  `tamara_bonus_rate` decimal(6,4) NOT NULL DEFAULT 0.1000,
  `notes` text NULL,
  `snapshot` mediumtext NULL,
  `created_by_user_id` int NOT NULL,
  `closed_by_user_id` int NULL,
  `closed_at` timestamp NULL,
  `reopened_by_user_id` int NULL,
  `reopened_at` timestamp NULL,
  `reopen_reason` text NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `massage_monthly_closures_id` PRIMARY KEY (`id`),
  CONSTRAINT `massage_monthly_closures_month_unique` UNIQUE (`close_month`)
);

CREATE TABLE IF NOT EXISTS `massage_monthly_closure_adjustments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `closure_id` int NOT NULL,
  `category` enum('courtesy','refund','extra_cost','correction','other') NOT NULL DEFAULT 'other',
  `description` varchar(255) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `created_by_user_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `massage_monthly_closure_adjustments_id` PRIMARY KEY (`id`),
  INDEX `massage_monthly_closure_adjustments_closure_idx` (`closure_id`)
);

CREATE TABLE IF NOT EXISTS `massage_monthly_closure_audit` (
  `id` int AUTO_INCREMENT NOT NULL,
  `closure_id` int NOT NULL,
  `action` enum('created','updated','closed','reopened','exported') NOT NULL,
  `detail` text NULL,
  `user_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `massage_monthly_closure_audit_id` PRIMARY KEY (`id`),
  INDEX `massage_monthly_closure_audit_closure_idx` (`closure_id`)
);

UPDATE `massage_therapists`
SET `is_manager` = 1
WHERE LOWER(TRIM(`name`)) IN ('tamara muñoz', 'tamara munoz');
