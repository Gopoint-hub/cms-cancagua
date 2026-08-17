ALTER TABLE `sauna_checkout_orders`
  MODIFY COLUMN `status` enum(
    'initiating',
    'payment_pending',
    'paid',
    'rejected',
    'aborted',
    'expired',
    'failed',
    'refunded',
    'manual_review'
  ) NOT NULL DEFAULT 'initiating';
