CREATE TABLE `concierge_service_prices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`concierge_service_id` int NOT NULL,
	`label` varchar(100) NOT NULL,
	`price` int NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`active` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `concierge_service_prices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `concierge_sales` ADD `price_label` varchar(100);--> statement-breakpoint
ALTER TABLE `concierge_service_prices` ADD CONSTRAINT `concierge_service_prices_concierge_service_id_concierge_services_id_fk` FOREIGN KEY (`concierge_service_id`) REFERENCES `concierge_services`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `concierge_services` DROP COLUMN `price`;