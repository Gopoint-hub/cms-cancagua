ALTER TABLE `users` MODIFY COLUMN `role` enum('super_admin','admin','editor','user','seller','concierge','cancagua_staff') NOT NULL DEFAULT 'user';
