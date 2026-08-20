ALTER TABLE `massage_bookings`
  MODIFY COLUMN `manual_payment_method` enum(
    'pending_payment','getnet_link','getnet_pos','bank_transfer','cash','gift_card','transbank','discount_code'
  ) NULL;

ALTER TABLE `massage_sales`
  MODIFY COLUMN `payment_method` enum(
    'getnet','cms_manual','getnet_link','getnet_pos','bank_transfer','cash','gift_card','transbank','discount_code'
  ) NOT NULL;
