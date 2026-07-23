ALTER TABLE `users`
  MODIFY COLUMN `role`
  enum('super_admin','admin','editor','user','seller','concierge','cancagua_staff','massage_therapist')
  NOT NULL DEFAULT 'user';

ALTER TABLE `massage_therapists`
  ADD COLUMN `cms_user_id` int,
  ADD COLUMN `cms_invitation_email_sent_at` timestamp NULL,
  ADD COLUMN `cms_invitation_whatsapp_sent_at` timestamp NULL;
