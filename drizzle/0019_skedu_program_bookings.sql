CREATE TABLE `massage_program_bookings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`program` varchar(50) NOT NULL,
	`duration` int NOT NULL,
	`modality` enum('simple','double') NOT NULL,
	`client_name` varchar(200) NOT NULL,
	`second_client_name` varchar(200),
	`client_phone` varchar(20),
	`client_email` varchar(320),
	`booking_date` date NOT NULL,
	`start_time` varchar(5) NOT NULL,
	`end_time` varchar(5) NOT NULL,
	`therapist_id` int NOT NULL,
	`second_therapist_id` int,
	`room_id` int NOT NULL,
	`external_reference` varchar(100),
	`notes` text,
	`status` enum('confirmed','completed','cancelled','no_show') NOT NULL DEFAULT 'confirmed',
	`created_by_user_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `massage_program_bookings_id` PRIMARY KEY(`id`)
);

UPDATE `massage_rooms`
SET `allow_couple_booking` = 1
WHERE `type` = 'double';
