CREATE TABLE `massage_settings` (
	`key` varchar(100) NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `massage_settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `massage_therapist_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`therapist_id` int NOT NULL,
	`tipo` enum('certificado','boleta','contrato','otro') NOT NULL DEFAULT 'otro',
	`nombre` varchar(300) NOT NULL,
	`descripcion` text,
	`archivo_url` text,
	`periodo` varchar(7),
	`uploaded_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `massage_therapist_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `massage_therapist_evaluations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`therapist_id` int NOT NULL,
	`period` varchar(7) NOT NULL,
	`evaluated_by` int NOT NULL,
	`puntualidad` int NOT NULL,
	`tecnica` int NOT NULL,
	`satisfaccion_cliente` int NOT NULL,
	`presentacion_higiene` int NOT NULL,
	`comunicacion` int NOT NULL,
	`uso_insumos` int NOT NULL,
	`comentarios` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `massage_therapist_evaluations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `clients` ADD `total_visitas` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `clients` ADD `total_gasto` decimal(12,0) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `clients` ADD `gasto_2025` decimal(12,0) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `clients` ADD `gasto_2026` decimal(12,0) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `clients` ADD `visitas_2025` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `clients` ADD `visitas_2026` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `clients` ADD `primer_visita` date;--> statement-breakpoint
ALTER TABLE `clients` ADD `ultima_visita` date;--> statement-breakpoint
ALTER TABLE `clients` ADD `servicios_usados` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `codigos_usados` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `es_leal` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `clients` ADD `origen` varchar(150);--> statement-breakpoint
ALTER TABLE `clients` ADD `idioma` varchar(10);--> statement-breakpoint
ALTER TABLE `clients` ADD `fecha_nacimiento` date;--> statement-breakpoint
ALTER TABLE `clients` ADD `genero` enum('M','F','nd') DEFAULT 'nd';--> statement-breakpoint
ALTER TABLE `clients` ADD `ticket_promedio` decimal DEFAULT '0';--> statement-breakpoint
ALTER TABLE `massage_bookings` ADD `getnet_request_id` varchar(64);--> statement-breakpoint
ALTER TABLE `massage_supplies` ADD `categoria` enum('insumo','herramienta') DEFAULT 'insumo' NOT NULL;--> statement-breakpoint
ALTER TABLE `massage_supplies` ADD `ubicacion` varchar(200);--> statement-breakpoint
ALTER TABLE `massage_supplies` ADD `vida_util_meses` int;