-- One-time upgrade for trial units generated before full-scope/runway separation.
-- The confirmed learning_scope_items remain the full plan; only excess materialized
-- unit links are removed from the two-unit TRY_IT runway.
WITH ranked AS (
  SELECT uc.unit_id,uc.concept_id,
         row_number() OVER (PARTITION BY uc.unit_id ORDER BY uc.position,uc.concept_id) AS n
  FROM learning_unit_concepts uc
  JOIN learning_runway_units ru USING(unit_id)
  JOIN learning_runways r USING(runway_id)
  WHERE r.commercial_product_key='TRY_IT'
)
DELETE FROM learning_unit_concepts uc
USING ranked x
WHERE uc.unit_id=x.unit_id AND uc.concept_id=x.concept_id AND x.n>3;

UPDATE learning_runways r
SET discovered_future_scope=COALESCE((
  SELECT jsonb_agg(jsonb_build_object(
    'conceptId',c.concept_id,'conceptKey',c.external_key,'name',c.name,
    'depthCategory',c.depth_category,'requirementClass',c.requirement_class
  ) ORDER BY i.position)
  FROM learning_scope_items i
  JOIN concepts c USING(concept_id)
  WHERE i.scope_id=r.scope_id AND i.selected
    AND NOT EXISTS (
      SELECT 1 FROM learning_runway_units ru
      JOIN learning_unit_concepts uc USING(unit_id)
      WHERE ru.runway_id=r.runway_id AND uc.concept_id=i.concept_id
    )
),'[]'::jsonb),updated_at=now()
WHERE r.commercial_product_key='TRY_IT';
