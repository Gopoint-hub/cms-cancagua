CREATE TABLE `marketing_calendar_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` varchar(10) NOT NULL,
	`title` text NOT NULL,
	`type` enum('newsletter','personal','social','otro') NOT NULL DEFAULT 'newsletter',
	`audience` text,
	`subject` text,
	`notes` text,
	`status` enum('pending','done','cancelled') NOT NULL DEFAULT 'pending',
	`html_template` text,
	`created_by_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `marketing_calendar_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `marketing_blog_articles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` text NOT NULL,
	`slug` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`meta_description` text,
	`meta_keywords` text,
	`category` varchar(100),
	`estimated_reading_time` int NOT NULL DEFAULT 5,
	`status` enum('draft','approved','published') NOT NULL DEFAULT 'draft',
	`campaign_subject` text,
	`published_url` text,
	`published_at` timestamp,
	`created_by_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `marketing_blog_articles_id` PRIMARY KEY(`id`),
	CONSTRAINT `marketing_blog_articles_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `personal_email_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`to` varchar(320) NOT NULL,
	`primer_nombre` varchar(120),
	`subject` text NOT NULL,
	`body_text` text NOT NULL,
	`reply_to` varchar(320),
	`status` enum('sent','failed') NOT NULL,
	`provider_id` varchar(255),
	`error_message` text,
	`sent_by_id` int,
	`sent_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `personal_email_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `marketing_calendar_events` ADD CONSTRAINT `marketing_calendar_events_created_by_id_users_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `marketing_blog_articles` ADD CONSTRAINT `marketing_blog_articles_created_by_id_users_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `personal_email_logs` ADD CONSTRAINT `personal_email_logs_sent_by_id_users_id_fk` FOREIGN KEY (`sent_by_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
