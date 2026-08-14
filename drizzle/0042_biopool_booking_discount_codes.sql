ALTER TABLE `biopool_bookings`
  ADD COLUMN `discount_code_id` int NULL AFTER `discount_amount_clp`,
  ADD COLUMN `discount_code` varchar(50) NULL AFTER `discount_code_id`;

UPDATE `biopool_bookings` AS booking
INNER JOIN `biopool_checkout_orders` AS checkout ON checkout.booking_id = booking.id
SET booking.discount_code_id = checkout.discount_code_id,
    booking.discount_code = checkout.discount_code
WHERE booking.discount_code IS NULL
  AND checkout.discount_code IS NOT NULL;
