CREATE TABLE IF NOT EXISTS `client_360_profiles` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `origin_key` varchar(160) NULL,
  `display_name` varchar(200) NOT NULL,
  `primary_email` varchar(320) NULL,
  `primary_phone` varchar(40) NULL,
  `notes` text NULL,
  `status` enum('active','merged') NOT NULL DEFAULT 'active',
  `merged_into_profile_id` int NULL,
  `created_by_user_id` int NULL,
  `updated_by_user_id` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `client_360_profile_origin_unique` (`origin_key`),
  INDEX `client_360_profile_status_idx` (`status`, `id`),
  INDEX `client_360_profile_merged_idx` (`merged_into_profile_id`)
);

CREATE TABLE IF NOT EXISTS `client_360_identities` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `profile_id` int NOT NULL,
  `kind` enum('email','phone','external') NOT NULL,
  `identity_key` varchar(400) NOT NULL,
  `normalized_value` varchar(320) NOT NULL,
  `display_value` varchar(320) NULL,
  `source` varchar(60) NOT NULL DEFAULT 'operations_360',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `client_360_identity_profile_unique` (`profile_id`, `kind`, `normalized_value`),
  INDEX `client_360_identity_lookup_idx` (`identity_key`, `profile_id`),
  INDEX `client_360_identity_profile_idx` (`profile_id`, `kind`)
);

CREATE TABLE IF NOT EXISTS `client_360_reservation_links` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `profile_id` int NOT NULL,
  `reservation_kind` varchar(60) NOT NULL,
  `reservation_id` int NOT NULL,
  `source_key` varchar(120) NOT NULL,
  `linked_by` enum('automatic','manual','merge') NOT NULL DEFAULT 'automatic',
  `created_by_user_id` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `client_360_reservation_source_unique` (`source_key`),
  INDEX `client_360_reservation_profile_idx` (`profile_id`, `reservation_kind`, `reservation_id`),
  INDEX `client_360_reservation_lookup_idx` (`reservation_kind`, `reservation_id`)
);

CREATE TABLE IF NOT EXISTS `client_360_audit` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `profile_id` int NOT NULL,
  `action` varchar(60) NOT NULL,
  `related_profile_id` int NULL,
  `detail` text NULL,
  `actor_user_id` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `client_360_audit_profile_idx` (`profile_id`, `created_at`),
  INDEX `client_360_audit_related_idx` (`related_profile_id`, `created_at`)
);

CREATE TABLE IF NOT EXISTS `client_360_external_events` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `profile_id` int NULL,
  `provider` varchar(40) NOT NULL DEFAULT 'skedu',
  `external_id` varchar(255) NOT NULL,
  `external_key` varchar(320) NOT NULL,
  `user_external_id` varchar(255) NULL,
  `business_external_id` varchar(255) NULL,
  `service_key` varchar(60) NOT NULL DEFAULT 'other',
  `service_name` varchar(220) NOT NULL,
  `variant_name` varchar(220) NULL,
  `event_date` date NOT NULL,
  `start_time` varchar(5) NULL,
  `end_time` varchar(5) NULL,
  `status` varchar(40) NOT NULL DEFAULT 'confirmed',
  `payment_status` varchar(40) NOT NULL DEFAULT 'unknown',
  `listed_amount_clp` int NOT NULL DEFAULT 0,
  `client_name` varchar(200) NULL,
  `client_email` varchar(320) NULL,
  `client_phone` varchar(40) NULL,
  `native_kind` varchar(60) NULL,
  `native_reservation_id` int NULL,
  `source_created_at` timestamp NULL,
  `source_updated_at` timestamp NULL,
  `raw_json` mediumtext NULL,
  `last_synced_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `client_360_external_key_unique` (`external_key`),
  INDEX `client_360_external_profile_date_idx` (`profile_id`, `event_date`, `start_time`),
  INDEX `client_360_external_user_idx` (`provider`, `user_external_id`, `event_date`),
  INDEX `client_360_external_native_idx` (`native_kind`, `native_reservation_id`)
);

-- Crea una ficha inicial por registro Skedu. Es deliberadamente conservador:
-- no fusiona ni siquiera correos/teléfonos compartidos; la aplicación solo usa
-- un alias para auto-vincular cuando ese alias conduce a una única ficha.
INSERT IGNORE INTO `client_360_profiles` (
  `origin_key`,
  `display_name`,
  `primary_email`,
  `primary_phone`,
  `created_at`,
  `updated_at`
)
SELECT
  CONCAT('legacy_client:', c.`id`),
  COALESCE(NULLIF(TRIM(c.`name`), ''), NULLIF(LOWER(TRIM(c.`email`)), ''), CONCAT('Cliente ', c.`id`)),
  NULLIF(LOWER(TRIM(c.`email`)), ''),
  NULLIF(TRIM(c.`phone`), ''),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM `clients` c
LEFT JOIN `client_360_profiles` p
  ON p.`origin_key` = CONCAT('legacy_client:', c.`id`)
WHERE p.`id` IS NULL;

INSERT IGNORE INTO `client_360_identities` (
  `profile_id`,
  `kind`,
  `identity_key`,
  `normalized_value`,
  `display_value`,
  `source`
)
SELECT
  p.`id`,
  'email',
  CONCAT('email:', LOWER(TRIM(p.`primary_email`))),
  LOWER(TRIM(p.`primary_email`)),
  p.`primary_email`,
  'skedu_clients'
FROM `client_360_profiles` p
WHERE p.`primary_email` IS NOT NULL
  AND TRIM(p.`primary_email`) <> ''
  AND p.`origin_key` LIKE 'legacy_client:%';

INSERT IGNORE INTO `client_360_identities` (
  `profile_id`,
  `kind`,
  `identity_key`,
  `normalized_value`,
  `display_value`,
  `source`
)
SELECT
  p.`id`,
  'external',
  CONCAT('external:skedu:', c.`skedu_id`),
  c.`skedu_id`,
  c.`skedu_id`,
  'skedu_clients'
FROM `clients` c
INNER JOIN `client_360_profiles` p
  ON p.`origin_key` = CONCAT('legacy_client:', c.`id`)
WHERE c.`skedu_id` IS NOT NULL
  AND TRIM(c.`skedu_id`) <> '';

INSERT IGNORE INTO `client_360_profiles` (
  `origin_key`,
  `display_name`,
  `primary_email`,
  `primary_phone`,
  `created_at`,
  `updated_at`
)
SELECT
  CONCAT('regular_class_student:', s.`id`),
  COALESCE(NULLIF(TRIM(CONCAT(COALESCE(s.`first_name`, ''), ' ', COALESCE(s.`last_name`, ''))), ''), CONCAT('Cliente ', s.`id`)),
  NULLIF(LOWER(TRIM(s.`email`)), ''),
  NULLIF(TRIM(s.`phone`), ''),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM `regular_class_students` s
LEFT JOIN `client_360_profiles` p
  ON p.`origin_key` = CONCAT('regular_class_student:', s.`id`)
WHERE p.`id` IS NULL;

INSERT IGNORE INTO `client_360_identities` (
  `profile_id`,
  `kind`,
  `identity_key`,
  `normalized_value`,
  `display_value`,
  `source`
)
SELECT
  p.`id`,
  'email',
  CONCAT('email:', LOWER(TRIM(p.`primary_email`))),
  LOWER(TRIM(p.`primary_email`)),
  p.`primary_email`,
  'regular_class_students'
FROM `client_360_profiles` p
WHERE p.`primary_email` IS NOT NULL
  AND TRIM(p.`primary_email`) <> ''
  AND p.`origin_key` LIKE 'regular_class_student:%';

INSERT IGNORE INTO `client_360_identities` (
  `profile_id`,
  `kind`,
  `identity_key`,
  `normalized_value`,
  `display_value`,
  `source`
)
SELECT
  p.`id`,
  'phone',
  CONCAT(
    'phone:',
    CASE
      WHEN CHAR_LENGTH(REGEXP_REPLACE(TRIM(p.`primary_phone`), '[^0-9]', '')) = 9
        AND LEFT(REGEXP_REPLACE(TRIM(p.`primary_phone`), '[^0-9]', ''), 1) = '9'
      THEN CONCAT('56', REGEXP_REPLACE(TRIM(p.`primary_phone`), '[^0-9]', ''))
      ELSE REGEXP_REPLACE(TRIM(p.`primary_phone`), '[^0-9]', '')
    END
  ),
  CASE
    WHEN CHAR_LENGTH(REGEXP_REPLACE(TRIM(p.`primary_phone`), '[^0-9]', '')) = 9
      AND LEFT(REGEXP_REPLACE(TRIM(p.`primary_phone`), '[^0-9]', ''), 1) = '9'
    THEN CONCAT('56', REGEXP_REPLACE(TRIM(p.`primary_phone`), '[^0-9]', ''))
    ELSE REGEXP_REPLACE(TRIM(p.`primary_phone`), '[^0-9]', '')
  END,
  p.`primary_phone`,
  CASE
    WHEN p.`origin_key` LIKE 'legacy_client:%' THEN 'skedu_clients'
    ELSE 'regular_class_students'
  END
FROM `client_360_profiles` p
WHERE p.`primary_phone` IS NOT NULL
  AND CHAR_LENGTH(REGEXP_REPLACE(TRIM(p.`primary_phone`), '[^0-9]', '')) >= 8
  AND (
    p.`origin_key` LIKE 'legacy_client:%'
    OR p.`origin_key` LIKE 'regular_class_student:%'
  );
