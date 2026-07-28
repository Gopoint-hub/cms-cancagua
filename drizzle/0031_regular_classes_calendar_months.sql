UPDATE `regular_class_settings`
SET `value` = '1'
WHERE `key` = 'period_start_day';
--> statement-breakpoint
UPDATE `regular_class_memberships`
SET `period_end` = LAST_DAY(`period_start`),
    `period_start` = DATE_FORMAT(`period_start`, '%Y-%m-01')
WHERE DAY(`period_start`) <> 1
   OR `period_end` <> LAST_DAY(`period_start`);
