ALTER TABLE `menu_items`
  ADD COLUMN `in_stock` int NOT NULL DEFAULT 1,
  ADD COLUMN `preparation_area` enum('cafe','reception') NOT NULL DEFAULT 'cafe';

CREATE TABLE `hot_tub_orders` (
  `id` int AUTO_INCREMENT NOT NULL,
  `order_number` varchar(32) NOT NULL,
  `customer_name` varchar(180) NOT NULL,
  `customer_phone` varchar(50) NOT NULL,
  `hot_tub_code` enum('1006','1005','1004','1003','1002','1001') NOT NULL,
  `service_date` date,
  `desired_time` varchar(5),
  `notes` text,
  `source` enum('menu','checkout') NOT NULL DEFAULT 'menu',
  `status` enum('submitted','acknowledged','preparing','ready','delivered','cancelled') NOT NULL DEFAULT 'submitted',
  `subtotal` int NOT NULL,
  `reception_notification_status` enum('pending','sent','failed','not_configured') NOT NULL DEFAULT 'pending',
  `cafe_notification_status` enum('pending','sent','failed','not_required','not_configured') NOT NULL DEFAULT 'pending',
  `requested_at` timestamp NOT NULL DEFAULT (now()),
  `acknowledged_at` timestamp NULL,
  `preparing_at` timestamp NULL,
  `ready_at` timestamp NULL,
  `delivered_at` timestamp NULL,
  `cancelled_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `hot_tub_orders_id` PRIMARY KEY(`id`),
  CONSTRAINT `hot_tub_orders_order_number_unique` UNIQUE(`order_number`)
);

CREATE TABLE `hot_tub_order_items` (
  `id` int AUTO_INCREMENT NOT NULL,
  `order_id` int NOT NULL,
  `menu_item_id` int NOT NULL,
  `item_name` varchar(255) NOT NULL,
  `price_key` varchar(40) NOT NULL,
  `price_label` varchar(80),
  `unit_price` int NOT NULL,
  `quantity` int NOT NULL,
  `line_total` int NOT NULL,
  `preparation_area` enum('cafe','reception') NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `hot_tub_order_items_id` PRIMARY KEY(`id`),
  CONSTRAINT `hot_tub_order_items_order_id_hot_tub_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `hot_tub_orders`(`id`) ON DELETE no action ON UPDATE no action,
  CONSTRAINT `hot_tub_order_items_menu_item_id_menu_items_id_fk` FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON DELETE no action ON UPDATE no action
);
