ALTER TABLE `massage_techniques`
  ADD COLUMN `monthly_only` int NOT NULL DEFAULT 0 AFTER `price_110min`,
  ADD COLUMN `monthly_feature_month` varchar(7) NULL AFTER `monthly_only`;

UPDATE `massage_techniques`
SET `monthly_only` = 1,
    `monthly_feature_month` = '2026-08'
WHERE `id` = 150002
  AND `monthly_feature_month` IS NULL;
