-- Auditoría de catálogo: condiciones de entrada y reglas conductuales.
--
-- Esta migración solo añade columnas y actualiza datos existentes por
-- "code" (identificador interno estable). No borra ni recrea ninguna fila
-- de "EntryCondition" / "BehavioralRule": las violaciones históricas
-- ("TradeViolation" / "SessionViolation") siguen apuntando a los mismos IDs.

-- ── Catálogo: flag de "ofrecido para nuevas estrategias" (soft delete) ──────
ALTER TABLE "EntryCondition" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BehavioralRule" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- ── Renombrar labels (code interno sin cambios) ──────────────────────────────
UPDATE "EntryCondition" SET "label" = 'Volumen Confirmado' WHERE "code" = 'VOLUME_CONFIRM';

UPDATE "BehavioralRule" SET "label" = 'Stop-Loss Respetado' WHERE "code" = 'NO_SL_MODIFY';
UPDATE "BehavioralRule" SET "label" = 'Entrada Deliberada' WHERE "code" = 'NO_IMPULSE_ENTRY';
UPDATE "BehavioralRule" SET "label" = 'Sin Trade de Venganza' WHERE "code" = 'NO_REVENGE_TRADE';
UPDATE "BehavioralRule" SET "label" = 'Horario Respetado' WHERE "code" = 'TRADING_HOURS';

-- ── Desactivar del catálogo ofrecido ─────────────────────────────────────────
-- CONDITIONS_MET duplicaba el conteo de condiciones de entrada en la fórmula
-- del ICO. STRATEGY_FOLLOWED es imposible de violar: la estrategia ya está
-- bloqueada mientras hay sesión abierta. Sus IDs y violaciones históricas
-- permanecen intactos; solo dejan de ofrecerse para activar en /strategy.
UPDATE "BehavioralRule" SET "isActive" = false WHERE "code" IN ('CONDITIONS_MET', 'STRATEGY_FOLLOWED');

-- ── Cambio de scope: de evaluación por sesión a evaluación por operación ────
-- Para sesiones ya cerradas esto no tiene efecto retroactivo: su icoScore
-- guardado no se recalcula. Afecta solo al cálculo de sesiones nuevas.
UPDATE "BehavioralRule" SET "scope" = 'PER_TRADE' WHERE "code" IN ('NO_REVENGE_TRADE', 'TRADING_HOURS');
