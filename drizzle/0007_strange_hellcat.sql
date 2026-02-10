CREATE TABLE `concierge_quota_usage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`concierge_service_id` int NOT NULL,
	`usage_date` varchar(10) NOT NULL,
	`used_quota` int NOT NULL DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `concierge_quota_usage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `concierge_services` ADD `daily_quota` int DEFAULT -1 NOT NULL;--> statement-breakpoint
ALTER TABLE `concierge_quota_usage` ADD CONSTRAINT `concierge_quota_usage_concierge_service_id_concierge_services_id_fk` FOREIGN KEY (`concierge_service_id`) REFERENCES `concierge_services`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `concierge_services` DROP COLUMN `available_quantity`;