ALTER TABLE `biopool_bookings`
  ADD COLUMN `agenda_hidden_at` timestamp NULL AFTER `cancelled_by_user_id`,
  ADD COLUMN `agenda_hidden_by_user_id` int NULL AFTER `agenda_hidden_at`;
