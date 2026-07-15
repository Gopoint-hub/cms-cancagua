CREATE TABLE `massage_sales` (
	`id` int AUTO_INCREMENT NOT NULL,
	`booking_id` int NOT NULL,
	`sold_at` timestamp NOT NULL DEFAULT (now()),
	`service_date` date NOT NULL,
	`start_time` varchar(5) NOT NULL,
	`client_name` varchar(200) NOT NULL,
	`client_email` varchar(320),
	`technique_name` varchar(100) NOT NULL,
	`duration` int NOT NULL,
	`amount` decimal(10,2) NOT NULL DEFAULT 0,
	`payment_method` enum('getnet','cms_manual') NOT NULL,
	`payment_reference` varchar(100),
	`status` enum('paid','refunded') NOT NULL DEFAULT 'paid',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `massage_sales_id` PRIMARY KEY(`id`),
	CONSTRAINT `massage_sales_booking_id_unique` UNIQUE(`booking_id`)
);

INSERT INTO `massage_sales` (
	`booking_id`, `sold_at`, `service_date`, `start_time`, `client_name`, `client_email`,
	`technique_name`, `duration`, `amount`, `payment_method`, `payment_reference`, `status`
)
SELECT
	b.`id`, b.`created_at`, b.`booking_date`, b.`start_time`, b.`client_name`, b.`client_email`,
	COALESCE(t.`name`, 'Masaje'), b.`duration`, COALESCE(b.`amount_paid`, 0),
	CASE WHEN b.`getnet_request_id` IS NOT NULL THEN 'getnet' ELSE 'cms_manual' END,
	b.`getnet_request_id`,
	CASE WHEN b.`payment_status` = 'refunded' THEN 'refunded' ELSE 'paid' END
FROM `massage_bookings` b
LEFT JOIN `massage_techniques` t ON t.`id` = b.`technique_id`
WHERE b.`payment_status` IN ('paid', 'refunded')
ON DUPLICATE KEY UPDATE
	`amount` = VALUES(`amount`),
	`status` = VALUES(`status`),
	`payment_reference` = VALUES(`payment_reference`);
