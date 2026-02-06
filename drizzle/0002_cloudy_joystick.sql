ALTER TABLE `events` ADD `slug` varchar(255);--> statement-breakpoint
ALTER TABLE `events` ADD `content_html` text;--> statement-breakpoint
ALTER TABLE `events` ADD `images` text;--> statement-breakpoint
ALTER TABLE `events` ADD `external_link` text;--> statement-breakpoint
ALTER TABLE `events` ADD `featured` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `events` ADD `status` varchar(50) DEFAULT 'active';