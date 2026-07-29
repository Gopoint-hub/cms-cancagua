ALTER TABLE `users`
  ADD COLUMN `permissions` text NULL AFTER `allowedModules`;

UPDATE `users`
SET `permissions` = JSON_ARRAY(
  'module.massages',
  'massages.assign_therapists'
)
WHERE (
  LOWER(COALESCE(`name`, '')) LIKE '%barbara%fri%'
  OR LOWER(COALESCE(`name`, '')) LIKE '%bárbara%frí%'
  OR LOWER(COALESCE(`name`, '')) LIKE '%daniela%caerol%'
);
