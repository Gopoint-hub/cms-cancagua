ALTER TABLE `users`
  ADD COLUMN `regular_classes_teacher` int NOT NULL DEFAULT 0;

CREATE TABLE `regular_class_teachers` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `cms_user_id` int NULL,
  `name` varchar(160) NOT NULL,
  `email` varchar(320) NULL,
  `phone` varchar(40) NULL,
  `bio` text NULL,
  `image_url` text NULL,
  `color` varchar(20) NOT NULL DEFAULT '#648596',
  `active` int NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `regular_class_teachers_cms_user_unique` (`cms_user_id`)
);

CREATE TABLE `regular_class_teacher_agreements` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `teacher_id` int NOT NULL,
  `teacher_share_bps` int NOT NULL,
  `document_type` enum('pending','honorarium_receipt','exempt_invoice','taxable_invoice','none') NOT NULL DEFAULT 'pending',
  `withholding_bps` int NOT NULL DEFAULT 1525,
  `vat_bps` int NOT NULL DEFAULT 1900,
  `valid_from` date NOT NULL,
  `valid_to` date NULL,
  `notes` text NULL,
  `created_by_user_id` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `regular_class_agreements_teacher_date_idx` (`teacher_id`, `valid_from`)
);

CREATE TABLE `regular_class_disciplines` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `name` varchar(180) NOT NULL,
  `short_description` varchar(300) NULL,
  `description` text NULL,
  `image_url` text NULL,
  `location` varchar(180) NULL,
  `capacity` int NULL,
  `active` int NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `regular_class_schedules` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `discipline_id` int NOT NULL,
  `teacher_id` int NOT NULL,
  `day_of_week` int NOT NULL,
  `start_time` varchar(5) NOT NULL,
  `end_time` varchar(5) NOT NULL,
  `valid_from` date NOT NULL,
  `valid_to` date NULL,
  `active` int NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `regular_class_schedules_day_idx` (`day_of_week`, `active`)
);

CREATE TABLE `regular_class_sessions` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `schedule_id` int NULL,
  `discipline_id` int NOT NULL,
  `teacher_id` int NOT NULL,
  `session_date` date NOT NULL,
  `start_time` varchar(5) NOT NULL,
  `end_time` varchar(5) NOT NULL,
  `status` enum('scheduled','completed','cancelled') NOT NULL DEFAULT 'scheduled',
  `notes` text NULL,
  `closed_at` timestamp NULL,
  `closed_by_user_id` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `regular_class_session_occurrence_unique` (`schedule_id`, `session_date`),
  INDEX `regular_class_sessions_date_teacher_idx` (`session_date`, `teacher_id`)
);

CREATE TABLE `regular_class_plans` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `code` varchar(30) NOT NULL UNIQUE,
  `name` varchar(100) NOT NULL,
  `price_clp` int NOT NULL,
  `credits_per_period` int NOT NULL,
  `benefits` text NULL,
  `display_order` int NOT NULL DEFAULT 0,
  `active` int NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `regular_class_students` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `first_name` varchar(120) NOT NULL,
  `last_name` varchar(120) NULL,
  `email` varchar(320) NULL,
  `phone` varchar(40) NULL,
  `status` enum('prospect','active','inactive') NOT NULL DEFAULT 'prospect',
  `source` enum('teacher','reception','admin','web') NOT NULL DEFAULT 'admin',
  `communications_consent` int NOT NULL DEFAULT 0,
  `notes` text NULL,
  `created_by_user_id` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `regular_class_students_email_idx` (`email`),
  INDEX `regular_class_students_phone_idx` (`phone`)
);

CREATE TABLE `regular_class_memberships` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `student_id` int NOT NULL,
  `plan_id` int NOT NULL,
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `price_paid_clp` int NOT NULL,
  `credits_total` int NOT NULL,
  `status` enum('pending_payment','active','postponed','completed','cancelled') NOT NULL DEFAULT 'pending_payment',
  `payment_status` enum('pending','paid','refunded') NOT NULL DEFAULT 'pending',
  `payment_method` varchar(60) NULL,
  `payment_reference` varchar(160) NULL,
  `paid_at` timestamp NULL,
  `carried_from_membership_id` int NULL,
  `carried_to_membership_id` int NULL,
  `notes` text NULL,
  `created_by_user_id` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `regular_class_memberships_student_period_idx` (`student_id`, `period_start`, `period_end`)
);

CREATE TABLE `regular_class_attendances` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `session_id` int NOT NULL,
  `student_id` int NOT NULL,
  `membership_id` int NULL,
  `status` enum('present','pending_payment','void') NOT NULL DEFAULT 'present',
  `notes` text NULL,
  `marked_by_user_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `regular_class_attendance_session_student_unique` (`session_id`, `student_id`),
  INDEX `regular_class_attendance_membership_idx` (`membership_id`, `status`)
);

CREATE TABLE `regular_class_payment_invitations` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `student_id` int NOT NULL,
  `token` varchar(64) NOT NULL UNIQUE,
  `status` enum('pending','sent','opened','completed','expired') NOT NULL DEFAULT 'pending',
  `payment_url` text NULL,
  `sent_at` timestamp NULL,
  `opened_at` timestamp NULL,
  `completed_at` timestamp NULL,
  `expires_at` timestamp NOT NULL,
  `created_by_user_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `regular_class_closures` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `status` enum('draft','closed') NOT NULL DEFAULT 'draft',
  `snapshot` mediumtext NULL,
  `notes` text NULL,
  `created_by_user_id` int NOT NULL,
  `closed_by_user_id` int NULL,
  `closed_at` timestamp NULL,
  `reopened_by_user_id` int NULL,
  `reopened_at` timestamp NULL,
  `reopen_reason` text NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `regular_class_closures_period_unique` (`period_start`, `period_end`)
);

CREATE TABLE `regular_class_audit` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `entity_type` varchar(60) NOT NULL,
  `entity_id` int NOT NULL,
  `action` varchar(60) NOT NULL,
  `detail` text NULL,
  `user_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `regular_class_audit_entity_idx` (`entity_type`, `entity_id`)
);

CREATE TABLE `regular_class_settings` (
  `key` varchar(100) PRIMARY KEY,
  `value` text NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `regular_class_benefit_entitlements` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `student_id` int NOT NULL,
  `membership_id` int NOT NULL,
  `benefit_code` varchar(80) NOT NULL,
  `benefit_name` varchar(220) NOT NULL,
  `eligible_at` date NOT NULL,
  `status` enum('available','notified','redeemed','expired') NOT NULL DEFAULT 'available',
  `notified_at` timestamp NULL,
  `redeemed_at` timestamp NULL,
  `notes` text NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `regular_class_benefit_membership_code_unique` (`membership_id`, `benefit_code`),
  INDEX `regular_class_benefit_student_status_idx` (`student_id`, `status`)
);

CREATE TABLE `regular_class_campaigns` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `name` varchar(180) NOT NULL,
  `subject` varchar(250) NOT NULL,
  `message` text NOT NULL,
  `audience` enum('all_active','2x_plus','3x_plus','4x_plus','5x','pending_payment') NOT NULL,
  `status` enum('draft','sending','sent','failed') NOT NULL DEFAULT 'draft',
  `sent_count` int NOT NULL DEFAULT 0,
  `failed_count` int NOT NULL DEFAULT 0,
  `created_by_user_id` int NOT NULL,
  `sent_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `regular_class_campaign_deliveries` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `campaign_id` int NOT NULL,
  `student_id` int NOT NULL,
  `recipient_email` varchar(320) NOT NULL,
  `status` enum('sent','failed','skipped') NOT NULL,
  `provider_id` varchar(160) NULL,
  `error` text NULL,
  `sent_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `regular_class_campaign_deliveries_campaign_idx` (`campaign_id`)
);

INSERT INTO `regular_class_teachers` (`name`, `color`) VALUES
  ('Andrea Ortúzar', '#648596'),
  ('Bernardita Mir', '#667594'),
  ('Claudia Silva', '#899169'),
  ('Marco Santana', '#967B64');

INSERT INTO `regular_class_teacher_agreements`
  (`teacher_id`, `teacher_share_bps`, `document_type`, `valid_from`)
SELECT `id`,
  CASE `name`
    WHEN 'Andrea Ortúzar' THEN 8000
    WHEN 'Bernardita Mir' THEN 0
    ELSE 7000
  END,
  CASE WHEN `name` = 'Bernardita Mir' THEN 'none' ELSE 'pending' END,
  '2026-01-01'
FROM `regular_class_teachers`;

INSERT INTO `regular_class_disciplines` (`name`, `active`) VALUES
  ('Hatha Yoga Intenso', 1),
  ('Hatha Yoga Suave', 1),
  ('Entrenamiento Funcional y Movilidad', 1),
  ('Meditación y Respiración', 1),
  ('Natación en Aguas Abiertas', 1);

INSERT INTO `regular_class_schedules`
  (`discipline_id`, `teacher_id`, `day_of_week`, `start_time`, `end_time`, `valid_from`)
SELECT d.id, t.id, x.day_of_week, x.start_time, x.end_time, '2026-01-01'
FROM (
  SELECT 'Hatha Yoga Intenso' discipline, 'Andrea Ortúzar' teacher, 1 day_of_week, '08:30' start_time, '09:45' end_time
  UNION ALL SELECT 'Hatha Yoga Intenso', 'Andrea Ortúzar', 3, '08:30', '09:45'
  UNION ALL SELECT 'Hatha Yoga Intenso', 'Andrea Ortúzar', 5, '08:30', '09:45'
  UNION ALL SELECT 'Hatha Yoga Suave', 'Andrea Ortúzar', 1, '10:15', '11:30'
  UNION ALL SELECT 'Hatha Yoga Suave', 'Andrea Ortúzar', 3, '10:15', '11:30'
  UNION ALL SELECT 'Entrenamiento Funcional y Movilidad', 'Bernardita Mir', 2, '08:30', '09:30'
  UNION ALL SELECT 'Entrenamiento Funcional y Movilidad', 'Bernardita Mir', 4, '08:30', '09:30'
  UNION ALL SELECT 'Meditación y Respiración', 'Claudia Silva', 2, '19:00', '20:00'
  UNION ALL SELECT 'Natación en Aguas Abiertas', 'Marco Santana', 2, '08:30', '09:30'
  UNION ALL SELECT 'Natación en Aguas Abiertas', 'Marco Santana', 4, '08:30', '09:30'
) x
JOIN `regular_class_disciplines` d ON d.name = x.discipline
JOIN `regular_class_teachers` t ON t.name = x.teacher;

INSERT INTO `regular_class_plans`
  (`code`, `name`, `price_clp`, `credits_per_period`, `benefits`, `display_order`) VALUES
  ('1x', '1 vez por semana', 38000, 4, 'Acceso a cualquier clase del programa', 1),
  ('2x', '2 veces por semana', 58000, 8, '15% de descuento en tickets de biopiscina', 2),
  ('3x', '3 veces por semana', 75000, 12, 'Beneficios anteriores + sauna jueves 10:00–12:00', 3),
  ('4x', '4 veces por semana', 89000, 16, 'Beneficios anteriores + Pulso 3 a 6 meses / Pulso 5 a 12 meses', 4),
  ('5x', '5 veces por semana', 99000, 20, 'Beneficios anteriores + Pulso 5 a 6 meses / Pulso 10 a 12 meses', 5),
  ('drop_in', 'Clase suelta', 15000, 1, 'Una clase del programa', 6);

INSERT INTO `regular_class_settings` (`key`, `value`) VALUES
  ('period_start_day', '26'),
  ('honorarium_withholding_bps', '1525'),
  ('vat_bps', '1900'),
  ('payment_base_url', 'https://cancagua.cl/clases');
