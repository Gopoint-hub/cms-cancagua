CREATE TABLE `analytics_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`event_type` varchar(100) NOT NULL,
	`page` varchar(255),
	`referrer` text,
	`user_agent` text,
	`ip_address` varchar(45),
	`session_id` varchar(255),
	`metadata` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analytics_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `blog_articles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` text NOT NULL,
	`slug` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`summary` text,
	`image_url` text,
	`author_id` int,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`published_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `blog_articles_id` PRIMARY KEY(`id`),
	CONSTRAINT `blog_articles_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(50) NOT NULL,
	`service_type` varchar(255) NOT NULL,
	`preferred_date` timestamp NOT NULL,
	`number_of_people` int NOT NULL,
	`message` text,
	`status` enum('pending','confirmed','cancelled') NOT NULL DEFAULT 'pending',
	`skedu_id` varchar(255),
	`amount` int NOT NULL DEFAULT 0,
	`utm_source` varchar(100),
	`utm_medium` varchar(100),
	`utm_campaign` varchar(100),
	`utm_term` varchar(100),
	`utm_content` varchar(100),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bookings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`skedu_id` varchar(255),
	`email` varchar(320) NOT NULL,
	`name` text,
	`phone` varchar(50),
	`subscribed_to_newsletter` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`last_synced_at` timestamp,
	`utm_source` varchar(100),
	`utm_medium` varchar(100),
	`utm_campaign` varchar(100),
	CONSTRAINT `clients_id` PRIMARY KEY(`id`),
	CONSTRAINT `clients_skedu_id_unique` UNIQUE(`skedu_id`)
);
--> statement-breakpoint
CREATE TABLE `contact_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(50) NOT NULL,
	`message` text NOT NULL,
	`status` enum('new','read','replied') NOT NULL DEFAULT 'new',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contact_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `content_translations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`content_key` varchar(255) NOT NULL,
	`language` varchar(10) NOT NULL,
	`original_content` text NOT NULL,
	`translated_content` text NOT NULL,
	`content_hash` varchar(64) NOT NULL,
	`is_reviewed` int NOT NULL DEFAULT 0,
	`reviewed_by` int,
	`reviewed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `content_translations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `corporate_clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_name` text NOT NULL,
	`contact_name` text NOT NULL,
	`contact_position` text,
	`contact_email` varchar(320) NOT NULL,
	`contact_phone` varchar(50),
	`contact_whatsapp` varchar(50),
	`rut` varchar(20),
	`giro` text,
	`address` text,
	`city` varchar(100),
	`country` varchar(100) DEFAULT 'Chile',
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `corporate_clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `corporate_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`category` varchar(100) NOT NULL,
	`price_type` enum('per_person','flat') NOT NULL DEFAULT 'per_person',
	`unit_price` int NOT NULL,
	`duration` int,
	`max_capacity` int,
	`includes` text,
	`active` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `corporate_products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` text NOT NULL,
	`pipeline` varchar(100) NOT NULL DEFAULT 'jornada_autocuidado',
	`stage` enum('nuevo','reunion_programada','cotizacion_enviada','negociacion','cerrado_ganado','cerrado_perdido') NOT NULL DEFAULT 'nuevo',
	`value` int NOT NULL DEFAULT 0,
	`close_date` date,
	`owner_id` int,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `discount_code_usages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`discount_code_id` int NOT NULL,
	`user_id` int,
	`user_email` varchar(320),
	`order_id` varchar(100),
	`order_type` varchar(50),
	`original_amount` int NOT NULL,
	`discount_amount` int NOT NULL,
	`final_amount` int NOT NULL,
	`used_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `discount_code_usages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `discount_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`discount_type` enum('fixed','percentage') NOT NULL DEFAULT 'percentage',
	`discount_value` int NOT NULL,
	`min_purchase` int NOT NULL DEFAULT 0,
	`max_discount` int,
	`max_uses` int,
	`max_uses_per_user` int NOT NULL DEFAULT 1,
	`current_uses` int NOT NULL DEFAULT 0,
	`assigned_user_id` int,
	`applicable_services` text,
	`starts_at` timestamp,
	`expires_at` timestamp,
	`active` int NOT NULL DEFAULT 1,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `discount_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `discount_codes_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`skedu_id` varchar(255),
	`title` text NOT NULL,
	`description` text,
	`start_date` timestamp NOT NULL,
	`end_date` timestamp,
	`duration` int,
	`price` int,
	`total_capacity` int NOT NULL,
	`available_capacity` int NOT NULL,
	`category` varchar(100),
	`image_url` text,
	`location` text,
	`active` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`last_synced_at` timestamp,
	CONSTRAINT `events_id` PRIMARY KEY(`id`),
	CONSTRAINT `events_skedu_id_unique` UNIQUE(`skedu_id`)
);
--> statement-breakpoint
CREATE TABLE `faqs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`category` varchar(100),
	`display_order` int NOT NULL DEFAULT 0,
	`active` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `faqs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gallery_images` (
	`id` int AUTO_INCREMENT NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`description` text,
	`category` varchar(100),
	`display_order` int NOT NULL DEFAULT 0,
	`active` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gallery_images_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gift_card_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gift_card_id` int NOT NULL,
	`transaction_type` enum('purchase','redemption','refund') NOT NULL,
	`amount` int NOT NULL,
	`balance_before` int NOT NULL,
	`balance_after` int NOT NULL,
	`order_type` varchar(50),
	`order_id` varchar(100),
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gift_card_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gift_cards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(20) NOT NULL,
	`amount` int NOT NULL,
	`balance` int NOT NULL,
	`background_image` varchar(255) NOT NULL DEFAULT 'default',
	`recipient_name` text,
	`recipient_email` varchar(320),
	`recipient_phone` varchar(50),
	`sender_name` text,
	`sender_email` varchar(320),
	`personal_message` text,
	`status` enum('active','redeemed','expired','cancelled') NOT NULL DEFAULT 'active',
	`purchase_status` enum('pending','completed','rejected','aborted','timeout','abandoned') NOT NULL DEFAULT 'pending',
	`payment_method` varchar(50),
	`payment_reference` varchar(100),
	`webpay_token` varchar(100),
	`webpay_buy_order` varchar(50),
	`webpay_session_id` varchar(100),
	`webpay_authorization_code` varchar(20),
	`webpay_card_number` varchar(20),
	`webpay_transaction_date` timestamp,
	`webpay_response_code` int,
	`delivery_method` enum('email','whatsapp','download') NOT NULL DEFAULT 'email',
	`delivered_at` timestamp,
	`expires_at` timestamp NOT NULL,
	`redeemed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gift_cards_id` PRIMARY KEY(`id`),
	CONSTRAINT `gift_cards_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `list_subscribers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`list_id` int NOT NULL,
	`subscriber_id` int NOT NULL,
	`added_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `list_subscribers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `maintenance_report_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`report_id` int NOT NULL,
	`previous_status` varchar(50),
	`new_status` varchar(50) NOT NULL,
	`changed_by_id` int NOT NULL,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `maintenance_report_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `maintenance_report_photos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`report_id` int NOT NULL,
	`url` text NOT NULL,
	`thumbnail_url` text,
	`description` text,
	`photo_type` enum('before','during','after','evidence') NOT NULL DEFAULT 'evidence',
	`uploaded_by_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `maintenance_report_photos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `maintenance_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`report_number` varchar(50) NOT NULL,
	`title` text NOT NULL,
	`area` varchar(100),
	`equipment` varchar(150),
	`location` text,
	`status` enum('pending','in_progress','completed','requires_follow_up') NOT NULL DEFAULT 'pending',
	`priority` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`maintenance_type` enum('preventive','corrective','emergency') NOT NULL DEFAULT 'corrective',
	`description` text,
	`resolution` text,
	`materials_used` text,
	`observations` text,
	`reported_by_id` int NOT NULL,
	`assigned_to_id` int,
	`scheduled_date` timestamp,
	`started_at` timestamp,
	`completed_at` timestamp,
	`next_maintenance_date` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `maintenance_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `maintenance_reports_report_number_unique` UNIQUE(`report_number`)
);
--> statement-breakpoint
CREATE TABLE `marketing_investments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`channel` enum('seo','facebook_organic','instagram_organic','tiktok_organic','facebook_ads','instagram_ads','google_ads','tiktok_ads','other') NOT NULL,
	`amount` int NOT NULL,
	`start_date` timestamp NOT NULL,
	`end_date` timestamp NOT NULL,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `marketing_investments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `menu_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` varchar(255) NOT NULL,
	`description` text,
	`display_order` int NOT NULL DEFAULT 0,
	`active` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `menu_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `menu_categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `menu_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category_id` int NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`image_url` text,
	`prices` text NOT NULL,
	`dietary_tags` text,
	`special_notes` text,
	`display_order` int NOT NULL DEFAULT 0,
	`active` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `menu_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `newsletter_lists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`newsletter_id` int NOT NULL,
	`list_id` int NOT NULL,
	`added_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `newsletter_lists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `newsletter_sends` (
	`id` int AUTO_INCREMENT NOT NULL,
	`newsletter_id` int NOT NULL,
	`subscriber_id` int NOT NULL,
	`status` enum('pending','sent','failed','bounced') NOT NULL DEFAULT 'pending',
	`sent_at` timestamp,
	`opened_at` timestamp,
	`clicked_at` timestamp,
	`error` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `newsletter_sends_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `newsletter_subscribers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` text,
	`status` enum('active','unsubscribed') NOT NULL DEFAULT 'active',
	`source` varchar(100) NOT NULL DEFAULT 'website',
	`metadata` text,
	`subscribed_at` timestamp NOT NULL DEFAULT (now()),
	`unsubscribed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `newsletter_subscribers_id` PRIMARY KEY(`id`),
	CONSTRAINT `newsletter_subscribers_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `newsletters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subject` text NOT NULL,
	`sender_name` varchar(100) NOT NULL DEFAULT 'Newsletter Cancagua',
	`html_content` text NOT NULL,
	`text_content` text,
	`design_prompt` text,
	`status` enum('draft','scheduled','sending','sent','failed') NOT NULL DEFAULT 'draft',
	`scheduled_at` timestamp,
	`sent_at` timestamp,
	`recipient_count` int NOT NULL DEFAULT 0,
	`open_count` int NOT NULL DEFAULT 0,
	`click_count` int NOT NULL DEFAULT 0,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `newsletters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `page_translations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`page_id` int NOT NULL,
	`language` varchar(10) NOT NULL,
	`translated_slug` varchar(255) NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`is_reviewed` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `page_translations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quote_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quote_id` int NOT NULL,
	`product_id` int,
	`product_name` text NOT NULL,
	`description` text,
	`quantity` int NOT NULL,
	`unit_price` int NOT NULL,
	`discount_type` enum('percentage','fixed') DEFAULT 'percentage',
	`discount_value` int DEFAULT 0,
	`total` int NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`schedule_time` varchar(10),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quote_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quote_number` varchar(50) NOT NULL,
	`name` text,
	`deal_id` int,
	`client_id` int,
	`client_name` text NOT NULL,
	`client_email` varchar(320) NOT NULL,
	`client_company` text,
	`client_position` text,
	`client_phone` varchar(50),
	`client_whatsapp` varchar(50),
	`client_rut` varchar(20),
	`client_address` text,
	`client_giro` text,
	`number_of_people` int NOT NULL,
	`event_date` date,
	`event_description` text,
	`itinerary` text,
	`subtotal` int NOT NULL,
	`discount_type` enum('percentage','fixed') DEFAULT 'percentage',
	`discount_value` int DEFAULT 0,
	`total` int NOT NULL,
	`valid_until` date NOT NULL,
	`status` enum('draft','sent','approved','event_completed','paid','invoiced') NOT NULL DEFAULT 'draft',
	`slug` varchar(100),
	`terms_of_purchase` text,
	`notes` text,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`sent_at` timestamp,
	`approved_at` timestamp,
	CONSTRAINT `quotes_id` PRIMARY KEY(`id`),
	CONSTRAINT `quotes_quote_number_unique` UNIQUE(`quote_number`)
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` int AUTO_INCREMENT NOT NULL,
	`skedu_id` varchar(255),
	`name` text NOT NULL,
	`description` text,
	`duration` int,
	`price` int,
	`category` varchar(100),
	`image_url` text,
	`active` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`last_synced_at` timestamp,
	CONSTRAINT `services_id` PRIMARY KEY(`id`),
	CONSTRAINT `services_skedu_id_unique` UNIQUE(`skedu_id`)
);
--> statement-breakpoint
CREATE TABLE `site_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(255) NOT NULL,
	`page_type` varchar(50) NOT NULL,
	`title_es` text NOT NULL,
	`description_es` text,
	`active` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `site_pages_id` PRIMARY KEY(`id`),
	CONSTRAINT `site_pages_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `site_settings` (
	`key` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `site_settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `subscriber_lists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`segmentation_rules` text,
	`subscriber_count` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriber_lists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `testimonials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` text NOT NULL,
	`role` text,
	`content` text NOT NULL,
	`rating` int DEFAULT 5,
	`image_url` text,
	`approved` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `testimonials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webhook_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`event` varchar(255) NOT NULL,
	`payload` text NOT NULL,
	`processed` int NOT NULL DEFAULT 0,
	`error` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webhook_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `loginMethod` varchar(64) DEFAULT 'email';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('super_admin','admin','editor','user','seller') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `lastSignedIn` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `status` enum('active','pending','inactive') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `allowedModules` text;--> statement-breakpoint
ALTER TABLE `users` ADD `invitationToken` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `invitationExpiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `resetToken` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `resetTokenExpiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `invitedBy` int;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);--> statement-breakpoint
ALTER TABLE `blog_articles` ADD CONSTRAINT `blog_articles_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_translations` ADD CONSTRAINT `content_translations_reviewed_by_users_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deals` ADD CONSTRAINT `deals_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `discount_code_usages` ADD CONSTRAINT `discount_code_usages_discount_code_id_discount_codes_id_fk` FOREIGN KEY (`discount_code_id`) REFERENCES `discount_codes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `discount_code_usages` ADD CONSTRAINT `discount_code_usages_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `discount_codes` ADD CONSTRAINT `discount_codes_assigned_user_id_users_id_fk` FOREIGN KEY (`assigned_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `discount_codes` ADD CONSTRAINT `discount_codes_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gift_card_transactions` ADD CONSTRAINT `gift_card_transactions_gift_card_id_gift_cards_id_fk` FOREIGN KEY (`gift_card_id`) REFERENCES `gift_cards`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `list_subscribers` ADD CONSTRAINT `list_subscribers_list_id_subscriber_lists_id_fk` FOREIGN KEY (`list_id`) REFERENCES `subscriber_lists`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `list_subscribers` ADD CONSTRAINT `list_subscribers_subscriber_id_newsletter_subscribers_id_fk` FOREIGN KEY (`subscriber_id`) REFERENCES `newsletter_subscribers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `maintenance_report_history` ADD CONSTRAINT `maintenance_report_history_report_id_maintenance_reports_id_fk` FOREIGN KEY (`report_id`) REFERENCES `maintenance_reports`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `maintenance_report_history` ADD CONSTRAINT `maintenance_report_history_changed_by_id_users_id_fk` FOREIGN KEY (`changed_by_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `maintenance_report_photos` ADD CONSTRAINT `maintenance_report_photos_report_id_maintenance_reports_id_fk` FOREIGN KEY (`report_id`) REFERENCES `maintenance_reports`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `maintenance_report_photos` ADD CONSTRAINT `maintenance_report_photos_uploaded_by_id_users_id_fk` FOREIGN KEY (`uploaded_by_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `maintenance_reports` ADD CONSTRAINT `maintenance_reports_reported_by_id_users_id_fk` FOREIGN KEY (`reported_by_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `maintenance_reports` ADD CONSTRAINT `maintenance_reports_assigned_to_id_users_id_fk` FOREIGN KEY (`assigned_to_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `menu_items` ADD CONSTRAINT `menu_items_category_id_menu_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `menu_categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `newsletter_lists` ADD CONSTRAINT `newsletter_lists_newsletter_id_newsletters_id_fk` FOREIGN KEY (`newsletter_id`) REFERENCES `newsletters`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `newsletter_lists` ADD CONSTRAINT `newsletter_lists_list_id_subscriber_lists_id_fk` FOREIGN KEY (`list_id`) REFERENCES `subscriber_lists`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `newsletter_sends` ADD CONSTRAINT `newsletter_sends_newsletter_id_newsletters_id_fk` FOREIGN KEY (`newsletter_id`) REFERENCES `newsletters`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `newsletter_sends` ADD CONSTRAINT `newsletter_sends_subscriber_id_newsletter_subscribers_id_fk` FOREIGN KEY (`subscriber_id`) REFERENCES `newsletter_subscribers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `newsletters` ADD CONSTRAINT `newsletters_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `page_translations` ADD CONSTRAINT `page_translations_page_id_site_pages_id_fk` FOREIGN KEY (`page_id`) REFERENCES `site_pages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_items` ADD CONSTRAINT `quote_items_quote_id_quotes_id_fk` FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_items` ADD CONSTRAINT `quote_items_product_id_corporate_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `corporate_products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_deal_id_deals_id_fk` FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_client_id_corporate_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `corporate_clients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;