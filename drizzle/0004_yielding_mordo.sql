ALTER TABLE `concierge_sales` ADD `webpay_token` varchar(255);--> statement-breakpoint
ALTER TABLE `concierge_sales` ADD `webpay_auth_code` varchar(100);--> statement-breakpoint
ALTER TABLE `concierge_sales` ADD `webpay_response_code` int;--> statement-breakpoint
ALTER TABLE `concierge_sales` ADD `webpay_card_number` varchar(20);--> statement-breakpoint
ALTER TABLE `concierge_sales` ADD `service_name` text;--> statement-breakpoint
ALTER TABLE `concierge_sales` DROP COLUMN `skedu_appointment_uuid`;--> statement-breakpoint
ALTER TABLE `concierge_sales` DROP COLUMN `skedu_group_uuid`;