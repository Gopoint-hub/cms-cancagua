CREATE TABLE `analytics_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`period_key` varchar(7) NOT NULL,
	`data` text NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `analytics_cache_id` PRIMARY KEY(`id`),
	CONSTRAINT `analytics_cache_period_key_unique` UNIQUE(`period_key`)
);
--> statement-breakpoint
ALTER TABLE `quote_items` DROP FOREIGN KEY `quote_items_product_id_corporate_products_id_fk`;
--> statement-breakpoint
ALTER TABLE `quote_items` MODIFY COLUMN `product_name` varchar(255);--> statement-breakpoint
ALTER TABLE `quote_items` MODIFY COLUMN `quantity` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `quote_items` MODIFY COLUMN `total` int;--> statement-breakpoint
ALTER TABLE `quote_items` MODIFY COLUMN `sort_order` int;--> statement-breakpoint
ALTER TABLE `quote_items` ADD `discount_percent` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `quote_items` ADD `subtotal` int NOT NULL;--> statement-breakpoint
ALTER TABLE `quote_items` ADD `notes` text;