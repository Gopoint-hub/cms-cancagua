ALTER TABLE `massage_program_bookings`
  ADD COLUMN `booking_group_id` varchar(36) NULL AFTER `id`,
  ADD COLUMN `group_sequence` int NOT NULL DEFAULT 1 AFTER `booking_group_id`,
  ADD COLUMN `group_size` int NOT NULL DEFAULT 1 AFTER `group_sequence`,
  ADD COLUMN `schedule_mode` enum('simultaneous','two_by_two') NOT NULL DEFAULT 'simultaneous' AFTER `group_size`,
  ADD KEY `massage_program_booking_group_idx` (`booking_group_id`, `group_sequence`);
