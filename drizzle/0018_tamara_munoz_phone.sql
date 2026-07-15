UPDATE `massage_therapists`
SET `phone` = '+56999002232'
WHERE LOWER(TRIM(`name`)) IN ('tamara muñoz', 'tamara munoz');
