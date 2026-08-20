ALTER TABLE `service_cart_checkout_items`
  MODIFY COLUMN `module` enum('biopools','sauna','massages','regular_classes') NOT NULL;
