ALTER TABLE `massage_therapist_availability`
ADD COLUMN `generation_source` varchar(30);

-- Los bloqueos temporales antiguos desactivaban por error el día semanal
-- completo. El rango seguirá bloqueado, pero el horario volverá a estar
-- disponible antes y después de esas fechas.
UPDATE `massage_therapist_schedules`
SET `available` = 1
WHERE `block_from` IS NOT NULL
  AND `block_to` IS NOT NULL;
