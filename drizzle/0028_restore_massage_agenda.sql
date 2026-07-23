-- Restaura reservas manuales pagadas que fueron canceladas por una limpieza
-- demasiado amplia de asignaciones pendientes. Solo afecta el motivo exacto
-- generado por el sistema y reservas CMS que ya tenían terapeuta.
UPDATE `massage_bookings`
SET `status` = 'completed',
    `cancellation_category` = NULL,
    `cancellation_reason` = NULL,
    `cancelled_at` = NULL,
    `cancelled_by_user_id` = NULL,
    `freelance_approval_status` = NULL
WHERE `booking_source` = 'cms'
  AND `payment_status` = 'paid'
  AND `therapist_id` IS NOT NULL
  AND `status` = 'cancelled'
  AND `cancellation_category` = 'system'
  AND `cancellation_reason` = 'Reserva vencida sin asignación manual.';
