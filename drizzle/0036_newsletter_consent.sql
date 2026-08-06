ALTER TABLE `newsletter_subscribers`
  MODIFY COLUMN `status` enum('pending','active','unsubscribed') NOT NULL DEFAULT 'pending',
  ADD COLUMN `confirmation_token` varchar(64),
  ADD COLUMN `confirmation_expires_at` timestamp NULL,
  ADD COLUMN `consented_at` timestamp NULL;
