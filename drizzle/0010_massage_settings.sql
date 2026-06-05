CREATE TABLE `massage_settings` (
	`key` varchar(100) NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `massage_settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
INSERT INTO `massage_settings` (`key`, `value`) VALUES ('disclaimer', 'Cancagua no se responsabiliza por lesiones preexistentes ni por reacciones alérgicas a los productos utilizados durante el servicio. El cliente declara estar en condiciones físicas adecuadas para recibir el tratamiento. En caso de condiciones médicas especiales (embarazo, lesiones, enfermedades crónicas), se recomienda consultar con un médico antes de agendar.');
