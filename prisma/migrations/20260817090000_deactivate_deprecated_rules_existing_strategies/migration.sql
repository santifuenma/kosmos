-- Completa el soft-delete de CONDITIONS_MET / STRATEGY_FOLLOWED (migración
-- 20260816120000_catalog_conditions_rules_audit) para estrategias que ya
-- existían antes de esa migración: seguían mostrando el toggle en /strategy
-- porque su StrategyRule ya estaba vinculado desde antes de desactivarlas
-- en el catálogo, y esa fila no se tocó en su momento.
--
-- Esta migración desactiva (isActive = false) esas dos reglas en TODAS las
-- StrategyRule existentes que las tuvieran activas. No borra ninguna fila,
-- no toca TradeViolation/SessionViolation, y no recalcula icoScore de
-- sesiones ya cerradas (permanecen inmutables). Solo afecta al cálculo de
-- Rs de sesiones nuevas que abran esas estrategias a partir de ahora.
UPDATE "StrategyRule" sr
SET "isActive" = false
FROM "BehavioralRule" br
WHERE sr."ruleId" = br.id
  AND br."code" IN ('CONDITIONS_MET', 'STRATEGY_FOLLOWED')
  AND sr."isActive" = true;
