-- Columna auto_fill_month para terapeutas (Tamara: copia mes anterior automáticamente)
ALTER TABLE `massage_therapists` ADD COLUMN `auto_fill_month` int NOT NULL DEFAULT 0;

-- Columna allow_couple_booking para salas (Lingue y Arrayán permiten pareja)
ALTER TABLE `massage_rooms` ADD COLUMN `allow_couple_booking` int NOT NULL DEFAULT 0;

-- Columna couple_booking_id para vincular dos masajes comprados juntos
ALTER TABLE `massage_bookings` ADD COLUMN `couple_booking_id` int;

-- Tabla principal de disponibilidad mensual (una fila por terapeuta por día)
CREATE TABLE `massage_therapist_availability` (
	`id` int AUTO_INCREMENT NOT NULL,
	`therapist_id` int NOT NULL,
	`date` date NOT NULL,
	`is_available` int NOT NULL DEFAULT 1,
	`start_time` varchar(5),
	`end_time` varchar(5),
	`shift` enum('am','pm'),
	`block_type` enum('vacation','sick_leave','personal','other'),
	`block_notes` varchar(255),
	`auto_generated` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `massage_therapist_availability_id` PRIMARY KEY(`id`),
	UNIQUE KEY `therapist_date_unique` (`therapist_id`, `date`)
);

-- Tabla de licencias y vacaciones (integración RRHH)
CREATE TABLE `massage_hr_leaves` (
	`id` int AUTO_INCREMENT NOT NULL,
	`therapist_id` int NOT NULL,
	`start_date` date NOT NULL,
	`end_date` date NOT NULL,
	`type` enum('vacation','sick_leave','maternity','personal','other') NOT NULL DEFAULT 'vacation',
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`notes` text,
	`approved_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `massage_hr_leaves_id` PRIMARY KEY(`id`)
);
