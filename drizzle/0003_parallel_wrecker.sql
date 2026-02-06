CREATE TABLE `concierge_sales` (
	`id` int AUTO_INCREMENT NOT NULL,
	`seller_id` int NOT NULL,
	`concierge_service_id` int NOT NULL,
	`amount` int NOT NULL,
	`commission_rate` int NOT NULL,
	`commission_amount` int NOT NULL,
	`customer_name` text NOT NULL,
	`customer_email` varchar(320),
	`customer_phone` varchar(50),
	`status` enum('pending','completed','cancelled','refunded') NOT NULL DEFAULT 'pending',
	`sale_reference` varchar(50) NOT NULL,
	`skedu_appointment_uuid` varchar(100),
	`skedu_group_uuid` varchar(100),
	`payment_link` text,
	`notes` text,
	`confirmed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `concierge_sales_id` PRIMARY KEY(`id`),
	CONSTRAINT `concierge_sales_sale_reference_unique` UNIQUE(`sale_reference`)
);
--> statement-breakpoint
CREATE TABLE `concierge_seller_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`seller_id` int NOT NULL,
	`period_type` enum('daily','weekly','monthly') NOT NULL,
	`period_key` varchar(20) NOT NULL,
	`total_sales` int NOT NULL DEFAULT 0,
	`transaction_count` int NOT NULL DEFAULT 0,
	`total_commission` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `concierge_seller_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `concierge_sellers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`commission_rate` int NOT NULL DEFAULT 10,
	`seller_code` varchar(20) NOT NULL,
	`company_name` text,
	`notes` text,
	`active` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `concierge_sellers_id` PRIMARY KEY(`id`),
	CONSTRAINT `concierge_sellers_user_id_unique` UNIQUE(`user_id`),
	CONSTRAINT `concierge_sellers_seller_code_unique` UNIQUE(`seller_code`)
);
--> statement-breakpoint
CREATE TABLE `concierge_services` (
	`id` int AUTO_INCREMENT NOT NULL,
	`service_id` int NOT NULL,
	`price` int NOT NULL,
	`available_quantity` int NOT NULL DEFAULT -1,
	`active` int NOT NULL DEFAULT 1,
	`seller_notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `concierge_services_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('super_admin','admin','editor','user','seller','concierge') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `concierge_sales` ADD CONSTRAINT `concierge_sales_seller_id_concierge_sellers_id_fk` FOREIGN KEY (`seller_id`) REFERENCES `concierge_sellers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `concierge_sales` ADD CONSTRAINT `concierge_sales_concierge_service_id_concierge_services_id_fk` FOREIGN KEY (`concierge_service_id`) REFERENCES `concierge_services`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `concierge_seller_metrics` ADD CONSTRAINT `concierge_seller_metrics_seller_id_concierge_sellers_id_fk` FOREIGN KEY (`seller_id`) REFERENCES `concierge_sellers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `concierge_sellers` ADD CONSTRAINT `concierge_sellers_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `concierge_services` ADD CONSTRAINT `concierge_services_service_id_services_id_fk` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `events` DROP COLUMN `slug`;--> statement-breakpoint
ALTER TABLE `events` DROP COLUMN `content_html`;--> statement-breakpoint
ALTER TABLE `events` DROP COLUMN `images`;--> statement-breakpoint
ALTER TABLE `events` DROP COLUMN `external_link`;--> statement-breakpoint
ALTER TABLE `events` DROP COLUMN `featured`;--> statement-breakpoint
ALTER TABLE `events` DROP COLUMN `status`;