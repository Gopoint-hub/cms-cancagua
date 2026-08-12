ALTER TABLE `hot_tub_orders`
  ADD COLUMN `identification_type` enum('hot_tub','key_fob') NOT NULL DEFAULT 'hot_tub' AFTER `customer_phone`,
  MODIFY COLUMN `hot_tub_code` enum('1006','1005','1004','1003','1002','1001') NULL,
  ADD COLUMN `key_fob_number` varchar(20) NULL AFTER `hot_tub_code`;
