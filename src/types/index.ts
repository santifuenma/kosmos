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

// ── Tipos de trading ─────────────────────────────────────────────────────────

export type TradeDirection = 'LONG' | 'SHORT'
export type TradeResult   = 'WIN' | 'LOSS' | 'BREAKEVEN'

// Violación de un trade individual.
// Solo uno de rule/condition estará relleno según el type.
export type TradeViolationItem = {
  id: string
  tradeId: string
  type: 'CONDITION_VIOLATION' | 'RULE_VIOLATION'
  ruleId: string | null
  conditionId: string | null
  rule: BehavioralRuleItem | null
  condition: EntryConditionItem | null
  createdAt: string
}

// Violación a nivel de sesión: siempre es una regla de scope PER_SESSION.
export type SessionViolationItem = {
  id: string
  sessionId: string
  ruleId: string
  rule: BehavioralRuleItem
  createdAt: string
}

// Trade con sus violaciones expandidas, en el orden en que fueron registrados.
export type TradeItem = {
  id: string
  sessionId: string
  timestamp: string
  direction: TradeDirection
  result: TradeResult
  asset: string | null
  pnlAmount: number | null
  notes: string | null
  createdAt: string
  violations: TradeViolationItem[]
}

// Datos de la intención embebidos dentro de una sesión.
// No incluye la sesión de vuelta para evitar la referencia circular.
export type IntentionSnapshot = {
  id: string
  date: string
  maxTrades: number
  tradingHoursStart: string
  tradingHoursEnd: string
  emotionalState: EmotionalState
  notes: string | null
  confirmedAt: string
}

// Respuesta de GET /api/session/active: sesión en curso con todos sus datos.
export type ActiveSessionData = {
  id: string
  status: 'OPEN'
  date: string
  createdAt: string
  closedAt: null
  icoScore: null
  trades: TradeItem[]
  violations: SessionViolationItem[]
  intention: IntentionSnapshot
  previousSessionDate: string | null
}

// Respuesta de GET /api/session/[id]: sesión cerrada con datos de análisis.
// Incluye la estrategia para poder mostrar el desglose de cumplimiento.
export type SessionResultData = {
  id: string
  status: 'OPEN' | 'CLOSED'
  date: string
  createdAt: string
  closedAt: string | null
  icoScore: number | null
  trades: TradeItem[]
  violations: SessionViolationItem[]
  intention: IntentionSnapshot
  strategy: StrategyWithRelations
}

// ── Historial y análisis semanal ─────────────────────────────────────────────

// Fila del historial de sesiones: versión compacta para la lista del historial.
// No incluye el detalle completo de trades/violaciones para mantener las
// respuestas paginadas ligeras; el detalle se obtiene en GET /api/session/[id].
export type SessionHistoryItem = {
  id: string
  date: string
  closedAt: string | null
  icoScore: number | null
  tradeCount: number
  violationCount: number       // trade violations + session violations
  emotionalState: EmotionalState
  pnlTotal: number | null      // suma de pnlAmount de todos los trades (null si ninguno tiene P&L)
}

// Respuesta paginada de GET /api/history
export type HistoryResponse = {
  sessions: SessionHistoryItem[]
  total: number
  page: number
  totalPages: number
}

// Datos de una semana para el gráfico de ICO semanal.
// null en icoWeekly significa semana sin sesiones (no se pinta punto en el gráfico).
export type WeeklyIcoItem = {
  weekStart: string       // Lunes de la semana (ISO date "YYYY-MM-DD")
  weekEnd: string         // Domingo de la semana
  weekLabel: string       // Ej: "Sem 14"
  icoWeekly: number | null
  sessionCount: number
  avgDailyIco: number | null
  stability: number | null
  dailyIcos: number[]
}

// Respuesta de GET /api/history/weekly
export type WeeklyHistoryResponse = {
  weeks: WeeklyIcoItem[]
}

// Mensaje de retroalimentación con nivel de importancia para el icono.
export type FeedbackMessage = {
  type: 'positive' | 'neutral' | 'warning' | 'info'
  text: string
}

// Respuesta de GET /api/history/feedback
export type FeedbackResponse = {
  messages: FeedbackMessage[]
  weekAnalyzed: string    // Descripción de la semana analizada
}

// ── Intención diaria ─────────────────────────────────────────────────────────

// Los cinco estados emocionales que el trader puede declarar antes de operar.
// Están predefinidos (no son texto libre) para poder correlacionarlos con el
// rendimiento posterior de forma sistemática y comparable entre sesiones.
export type EmotionalState = 'NEUTRAL' | 'ANXIOUS' | 'CONFIDENT' | 'FRUSTRATED' | 'TIRED'

// Metadatos visuales para cada estado emocional.
// Se centralizan aquí para que dashboard, formulario y resúmenes usen
// siempre los mismos emojis y etiquetas sin duplicar la información.
export const EMOTIONAL_STATE_LABELS: Record<EmotionalState, { label: string; emoji: string }> = {
  NEUTRAL:    { label: 'Neutro',     emoji: '😐' },
  ANXIOUS:    { label: 'Ansioso',    emoji: '😰' },
  CONFIDENT:  { label: 'Confiado',   emoji: '💪' },
  FRUSTRATED: { label: 'Frustrado',  emoji: '😤' },
  TIRED:      { label: 'Cansado',    emoji: '😴' },
}

// Resumen de sesión que se incluye dentro de TodayIntention.
// Solo contiene los campos necesarios para saber el estado del día actual,
// sin cargar los trades ni violaciones.
export type SessionSummary = {
  id: string
  status: 'OPEN' | 'CLOSED'
  icoScore: number | null
  createdAt: string
  closedAt: string | null
}

// Intención del día actual con su sesión asociada (si la tiene).
// Este tipo devuelve GET /api/intention y lo usa la Navbar y la página de nueva sesión.
export type TodayIntention = {
  id: string
  date: string
  maxTrades: number
  tradingHoursStart: string
  tradingHoursEnd: string
  emotionalState: EmotionalState
  notes: string | null
  confirmedAt: string | null
  session: SessionSummary | null
}
