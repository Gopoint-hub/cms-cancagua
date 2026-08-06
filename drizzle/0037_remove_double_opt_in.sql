UPDATE `newsletter_subscribers` SET `status` = 'active' WHERE `status` = 'pending';
ALTER TABLE `newsletter_subscribers`
  MODIFY COLUMN `status` enum('active','unsubscribed') NOT NULL DEFAULT 'active',
  DROP COLUMN `confirmation_token`,
  DROP COLUMN `confirmation_expires_at`,
  DROP COLUMN `consented_at`;
