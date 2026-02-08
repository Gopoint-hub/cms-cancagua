ALTER TABLE `concierge_service_prices` DROP FOREIGN KEY `concierge_service_prices_concierge_service_id_concierge_services_id_fk`;
--> statement-breakpoint
ALTER TABLE `concierge_service_prices` ADD `cs_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `concierge_service_prices` ADD CONSTRAINT `concierge_service_prices_cs_id_concierge_services_id_fk` FOREIGN KEY (`cs_id`) REFERENCES `concierge_services`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `concierge_service_prices` DROP COLUMN `concierge_service_id`;