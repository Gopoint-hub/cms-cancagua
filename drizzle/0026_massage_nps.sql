CREATE TABLE IF NOT EXISTS `massage_nps_responses` (
  `id` int AUTO_INCREMENT NOT NULL,
  `booking_type` enum('massage','skedu_program') NOT NULL,
  `booking_id` int NOT NULL,
  `survey_token` varchar(64) NOT NULL,
  `service_name` varchar(200) NOT NULL,
  `client_name` varchar(200) NOT NULL,
  `client_phone` varchar(30) NOT NULL,
  `service_date` date NOT NULL,
  `end_time` varchar(5) NOT NULL,
  `scheduled_send_at` timestamp NOT NULL,
  `delivery_status` enum('pending','sending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
  `attempt_count` int NOT NULL DEFAULT 0,
  `last_attempt_at` timestamp NULL,
  `sent_at` timestamp NULL,
  `delivery_error` text NULL,
  `score` int NULL,
  `comment` text NULL,
  `responded_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `massage_nps_responses_id` PRIMARY KEY(`id`),
  CONSTRAINT `massage_nps_survey_token_unique` UNIQUE(`survey_token`),
  CONSTRAINT `massage_nps_booking_unique` UNIQUE(`booking_type`, `booking_id`)
);

ALTER TABLE `massage_bookings`
  ADD COLUMN `booking_source` enum('web','cms') NOT NULL DEFAULT 'cms';

UPDATE `massage_bookings`
SET `booking_source` = 'web'
WHERE `getnet_request_id` IS NOT NULL;
