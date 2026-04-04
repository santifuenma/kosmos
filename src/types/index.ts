// ─────────────────────────────────────────────────────────────────────────────
// Tipos compartidos del proyecto KOSMOS
//
// Estos tipos reflejan la estructura de la base de datos pero adaptada al
// formato que circula entre la API y los componentes cliente.
// Usamos string para los DateTime porque JSON serializa las fechas como ISO 8601.
// ─────────────────────────────────────────────────────────────────────────────

// ── Catálogos del sistema ────────────────────────────────────────────────────

// Una condición de entrada del catálogo predefinido (ej: "Tendencia Confirmada")
export type EntryConditionItem = {
  id: string
  code: string
  label: string
  description: string
}

// Una regla conductual del catálogo predefinido (ej: "Mantener SL")
// El scope distingue si se evalúa por operación o una vez por sesión
export type BehavioralRuleItem = {
  id: string
  code: string
  label: string
  description: string
  scope: 'PER_TRADE' | 'PER_SESSION'
}

// ── Tablas intermedias de estrategia ────────────────────────────────────────

// StrategyCondition: vínculo entre la estrategia del usuario y una condición
// del catálogo. isActive indica si el usuario la ha activado en su operativa.
export type StrategyConditionItem = {
  id: string
  strategyId: string
  conditionId: string
  isActive: boolean
  condition: EntryConditionItem
}

// StrategyRule: vínculo entre la estrategia del usuario y una regla conductual.
// isActive indica si el usuario se compromete a seguir esa regla.
export type StrategyRuleItem = {
  id: string
  strategyId: string
  ruleId: string
  isActive: boolean
  rule: BehavioralRuleItem
}

// ── Estrategia completa ──────────────────────────────────────────────────────

// Estrategia con todas sus relaciones expandidas.
// Este es el tipo que devuelve GET /api/strategy y que usa la página de strategy.
export type StrategyWithRelations = {
  id: string
  userId: string
  name: string
  description: string | null
  // Límites operativos fijos. Se definen en la estrategia para que sean
  // consistentes entre sesiones y no se modifiquen por impulso día a día.
  maxTrades: number
  tradingHoursStart: string // Formato "HH:mm"
  tradingHoursEnd: string   // Formato "HH:mm"
  createdAt: string
  updatedAt: string
  conditions: StrategyConditionItem[]
  rules: StrategyRuleItem[]
}
