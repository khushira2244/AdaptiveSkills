ALTER TABLE purchase_attempts DROP CONSTRAINT purchase_attempts_product_key_check;
ALTER TABLE purchase_attempts ADD CONSTRAINT purchase_attempts_product_key_check
  CHECK (product_key IN ('TRY_IT_WITH_LABS','GROWTH_RUNWAY'));

UPDATE commercial_offers
SET revenuecat_package_id='growth_runway',
    revenuecat_product_id='adaptive_labs_growth_799',
    active=true,
    updated_at=now()
WHERE commercial_product_key IN ('FOCUS','GROWTH','DEEP');
