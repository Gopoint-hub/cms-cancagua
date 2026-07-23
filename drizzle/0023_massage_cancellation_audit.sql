ALTER TABLE `massage_bookings`
  ADD COLUMN `cancellation_category` varchar(50),
  ADD COLUMN `cancellation_reason` text,
  ADD COLUMN `cancelled_at` timestamp NULL,
  ADD COLUMN `cancelled_by_user_id` int;
--> statement-breakpoint
ALTER TABLE `massage_program_bookings`
  ADD COLUMN `cancellation_category` varchar(50),
  ADD COLUMN `cancellation_reason` text,
  ADD COLUMN `cancelled_at` timestamp NULL,
  ADD COLUMN `cancelled_by_user_id` int;
