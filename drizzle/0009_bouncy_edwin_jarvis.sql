CREATE TABLE `massage_bookings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_name` varchar(200) NOT NULL,
	`client_email` varchar(320),
	`client_phone` varchar(20),
	`client_origin` varchar(100),
	`technique_id` int NOT NULL,
	`therapist_id` int,
	`room_id` int NOT NULL,
	`duration` int NOT NULL,
	`booking_date` date NOT NULL,
	`start_time` varchar(5) NOT NULL,
	`end_time` varchar(5) NOT NULL,
	`status` enum('pending','confirmed','completed','cancelled','no_show') NOT NULL DEFAULT 'pending',
	`payment_status` enum('pending','paid','refunded') NOT NULL DEFAULT 'pending',
	`amount_paid` decimal(10,2),
	`discount_code` varchar(50),
	`notes` text,
	`cross_sell_services` text,
	`reschedule_count` int NOT NULL DEFAULT 0,
	`original_booking_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `massage_bookings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `massage_rooms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`type` enum('individual','double') NOT NULL,
	`capacity` int NOT NULL,
	`active` int NOT NULL DEFAULT 1,
	CONSTRAINT `massage_rooms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `massage_supplies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`unit` varchar(50) NOT NULL,
	`current_stock` decimal(10,2) NOT NULL DEFAULT '0',
	`minimum_stock` decimal(10,2) NOT NULL DEFAULT '0',
	`purchased_at` date,
	`opened_at` date,
	`notes` text,
	`active` int NOT NULL DEFAULT 1,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `massage_supplies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `massage_technique_recipes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`technique_id` int NOT NULL,
	`supply_id` int NOT NULL,
	`quantity_per_50min` decimal(8,3) NOT NULL,
	`quantity_per_80min` decimal(8,3),
	`quantity_per_110min` decimal(8,3),
	CONSTRAINT `massage_technique_recipes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `massage_techniques` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`durations` varchar(50) NOT NULL DEFAULT '50,80,110',
	`price_50min` decimal,
	`price_80min` decimal,
	`price_110min` decimal,
	`active` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `massage_techniques_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `massage_therapist_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`therapist_id` int NOT NULL,
	`day_of_week` int NOT NULL,
	`start_time` varchar(5) NOT NULL,
	`end_time` varchar(5) NOT NULL,
	`available` int NOT NULL DEFAULT 1,
	`block_from` date,
	`block_to` date,
	`block_reason` varchar(255),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `massage_therapist_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `massage_therapist_techniques` (
	`id` int AUTO_INCREMENT NOT NULL,
	`therapist_id` int NOT NULL,
	`technique_id` int NOT NULL,
	CONSTRAINT `massage_therapist_techniques_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `massage_therapists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`type` enum('inhouse','freelance') NOT NULL,
	`phone` varchar(20),
	`email` varchar(320),
	`contract_type` varchar(100),
	`lead_time_minutes` int DEFAULT 120,
	`current_shift` enum('am','pm') DEFAULT 'am',
	`notes` text,
	`call_priority` int DEFAULT 99,
	`active` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `massage_therapists_id` PRIMARY KEY(`id`)
);
