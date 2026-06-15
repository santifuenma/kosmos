// ─────────────────────────────────────────────────────────────────────────────
// seed-test-data.ts — Generador de datos de prueba para el historial.
//
// Crea sesiones cerradas con trades y violaciones realistas para poder
// verificar que el historial, el gráfico de ICO semanal y la retroalimentación
// funcionan correctamente con datos reales.
//
// Uso: npm run seed:test
//
// IMPORTANTE: Este script NO es el seed de catálogos (seed.ts). Solo crea
// datos de usuario para pruebas. Requiere que el seed principal ya se haya
// ejecutado (entryConditions y behavioralRules deben existir).
//
// El script es idempotente a nivel de intenciones/sesiones del día:
// borra las sesiones y intenciones de prueba antes de crearlas para que
// se pueda ejecutar varias veces sin duplicar datos.
// ─────────────────────────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'node:path'

const dbPath = path.join(process.cwd(), 'prisma', 'dev.db')
const adapter = new PrismaBetterSqlite3({ url: dbPath })
const prisma = new PrismaClient({ adapter })

// ─────────────────────────────────────────────────────────────────────────────
// Datos de prueba: 10 sesiones en las últimas 3 semanas
// Diseñadas para mostrar variedad: ICO altos, bajos, diferentes emociones,
// con y sin violaciones, con y sin P&L.
// ─────────────────────────────────────────────────────────────────────────────

// Construye una fecha UTC de N días antes de hoy
function daysAgo(n: number): Date {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - n))
}

// ICO calculado manualmente para cada sesión de prueba, para poder verificar
// que el cálculo del servidor coincide con los datos insertados.
type SessionSpec = {
  daysBack: number
  emotionalState: string
  maxTrades: number
  notes: string | null
  trades: Array<{
    direction: 'LONG' | 'SHORT'
    result: 'WIN' | 'LOSS' | 'BREAKEVEN'
    pnlAmount: number | null
    notes: string | null
    violatedConditionCodes: string[]
    violatedRuleCodesPerTrade: string[]
  }>
  violatedSessionRuleCodes: string[]
}

const TEST_SESSIONS: SessionSpec[] = [
  // ── Semana -2 (hace ~14 días) ────────────────────────────────────────────

  {
    daysBack: 16,
    emotionalState: 'CONFIDENT',
    maxTrades: 3,
    notes: 'Mercado con tendencia clara, buenas condiciones',
    trades: [
      { direction: 'LONG', result: 'WIN', pnlAmount: 250, notes: null, violatedConditionCodes: [], violatedRuleCodesPerTrade: [] },
      { direction: 'LONG', result: 'WIN', pnlAmount: 180, notes: 'Setup perfecto', violatedConditionCodes: [], violatedRuleCodesPerTrade: [] },
    ],
    violatedSessionRuleCodes: [],
    // ICO: Rs=(2×6)+(2×4)+4=24, Vs=0 → ICO=1.0
  },
  {
    daysBack: 15,
    emotionalState: 'NEUTRAL',
    maxTrades: 3,
    notes: null,
    trades: [
      { direction: 'SHORT', result: 'WIN', pnlAmount: 120, notes: null, violatedConditionCodes: [], violatedRuleCodesPerTrade: [] },
      { direction: 'LONG', result: 'LOSS', pnlAmount: -90, notes: 'SL demasiado ajustado', violatedConditionCodes: ['SR_LEVEL'], violatedRuleCodesPerTrade: ['NO_SL_MODIFY'] },
      { direction: 'LONG', result: 'BREAKEVEN', pnlAmount: 0, notes: null, violatedConditionCodes: [], violatedRuleCodesPerTrade: [] },
    ],
    violatedSessionRuleCodes: [],
    // ICO: Rs=(3×6)+(3×4)+4=34, Vs=2 → ICO≈0.94
  },
  {
    daysBack: 14,
    emotionalState: 'ANXIOUS',
    maxTrades: 3,
    notes: 'Noticias macro a las 14:30, precaución',
    trades: [
      { direction: 'LONG', result: 'LOSS', pnlAmount: -200, notes: 'Entré tarde', violatedConditionCodes: ['TREND_CONFIRM', 'VOLUME_CONFIRM'], violatedRuleCodesPerTrade: ['NO_IMPULSE_ENTRY'] },
      { direction: 'SHORT', result: 'LOSS', pnlAmount: -150, notes: null, violatedConditionCodes: ['TREND_CONFIRM'], violatedRuleCodesPerTrade: ['NO_SL_MODIFY'] },
      { direction: 'LONG', result: 'LOSS', pnlAmount: -100, notes: 'Tercer intento', violatedConditionCodes: ['RR_ACCEPTABLE'], violatedRuleCodesPerTrade: ['NO_IMPULSE_ENTRY'] },
    ],
    violatedSessionRuleCodes: ['NO_REVENGE_TRADE', 'STRATEGY_FOLLOWED'],
    // Sesión con muchas violaciones, ICO bajo
  },

  // ── Semana -1 (hace ~7 días) ─────────────────────────────────────────────

  {
    daysBack: 11,
    emotionalState: 'CONFIDENT',
    maxTrades: 3,
    notes: 'Semana de recuperación, actitud positiva',
    trades: [
      { direction: 'LONG', result: 'WIN', pnlAmount: 300, notes: null, violatedConditionCodes: [], violatedRuleCodesPerTrade: [] },
      { direction: 'SHORT', result: 'WIN', pnlAmount: 150, notes: null, violatedConditionCodes: [], violatedRuleCodesPerTrade: [] },
    ],
    violatedSessionRuleCodes: [],
    // Sesión perfecta, ICO=1.0
  },
  {
    daysBack: 10,
    emotionalState: 'TIRED',
    maxTrades: 3,
    notes: 'Dormí mal, debería haberme saltado el día',
    trades: [
      { direction: 'LONG', result: 'LOSS', pnlAmount: -80, notes: null, violatedConditionCodes: ['INDICATOR_SIGNAL'], violatedRuleCodesPerTrade: ['NO_EARLY_EXIT'] },
      { direction: 'LONG', result: 'LOSS', pnlAmount: -60, notes: null, violatedConditionCodes: ['TREND_CONFIRM', 'VOLUME_CONFIRM'], violatedRuleCodesPerTrade: ['NO_IMPULSE_ENTRY'] },
    ],
    violatedSessionRuleCodes: ['NO_REVENGE_TRADE'],
    // Sesión con estado cansado, ICO bajo
  },
  {
    daysBack: 9,
    emotionalState: 'NEUTRAL',
    maxTrades: 3,
    notes: null,
    trades: [
      { direction: 'SHORT', result: 'WIN', pnlAmount: 200, notes: null, violatedConditionCodes: [], violatedRuleCodesPerTrade: [] },
      { direction: 'LONG', result: 'BREAKEVEN', pnlAmount: 5, notes: null, violatedConditionCodes: [], violatedRuleCodesPerTrade: ['NO_SL_MODIFY'] },
      { direction: 'SHORT', result: 'WIN', pnlAmount: 130, notes: null, violatedConditionCodes: [], violatedRuleCodesPerTrade: [] },
    ],
    violatedSessionRuleCodes: [],
  },
  {
    daysBack: 8,
    emotionalState: 'CONFIDENT',
    maxTrades: 3,
    notes: 'Mercado volátil pero con dirección',
    trades: [
      { direction: 'LONG', result: 'WIN', pnlAmount: 400, notes: 'Mejor trade del mes', violatedConditionCodes: [], violatedRuleCodesPerTrade: [] },
      { direction: 'LONG', result: 'WIN', pnlAmount: 220, notes: null, violatedConditionCodes: [], violatedRuleCodesPerTrade: [] },
    ],
    violatedSessionRuleCodes: [],
    // Sesión perfecta con buen P&L
  },

  // ── Semana actual ─────────────────────────────────────────────────────────

  {
    daysBack: 4,
    emotionalState: 'NEUTRAL',
    maxTrades: 3,
    notes: 'Inicio de semana, sin grandes noticias',
    trades: [
      { direction: 'SHORT', result: 'WIN', pnlAmount: 180, notes: null, violatedConditionCodes: [], violatedRuleCodesPerTrade: [] },
      { direction: 'SHORT', result: 'WIN', pnlAmount: 90, notes: null, violatedConditionCodes: ['PATTERN_FORMED'], violatedRuleCodesPerTrade: [] },
    ],
    violatedSessionRuleCodes: [],
  },
  {
    daysBack: 3,
    emotionalState: 'FRUSTRATED',
    maxTrades: 3,
    notes: 'Perdí oportunidades ayer por ser demasiado selectivo',
    trades: [
      { direction: 'LONG', result: 'LOSS', pnlAmount: -120, notes: null, violatedConditionCodes: ['RR_ACCEPTABLE'], violatedRuleCodesPerTrade: ['NO_IMPULSE_ENTRY'] },
      { direction: 'LONG', result: 'LOSS', pnlAmount: -100, notes: null, violatedConditionCodes: ['TREND_CONFIRM'], violatedRuleCodesPerTrade: ['NO_IMPULSE_ENTRY'] },
      { direction: 'SHORT', result: 'LOSS', pnlAmount: -80, notes: null, violatedConditionCodes: ['VOLUME_CONFIRM'], violatedRuleCodesPerTrade: ['NO_IMPULSE_ENTRY'] },
    ],
    // 3 trades cuando el máximo es 3, y con estado frustrado: patrón interesante
    // para la retroalimentación emocional
    violatedSessionRuleCodes: ['NO_REVENGE_TRADE'],
  },
  {
    daysBack: 2,
    emotionalState: 'NEUTRAL',
    maxTrades: 3,
    notes: 'Recuperando la calma, sesión corta',
    trades: [
      { direction: 'LONG', result: 'WIN', pnlAmount: 150, notes: null, violatedConditionCodes: [], violatedRuleCodesPerTrade: [] },
    ],
    violatedSessionRuleCodes: [],
    // Sesión corta pero perfecta
  },
]

async function main() {
  console.log('Generando datos de prueba para el historial...\n')

  // Verificamos que existe un usuario y su estrategia antes de continuar.
  const user = await prisma.user.findFirst()
  if (!user) {
    console.error('❌ No hay usuarios en la BD. Regístrate primero desde la app.')
    process.exit(1)
  }

  const strategy = await prisma.strategy.findUnique({ where: { userId: user.id } })
  if (!strategy) {
    console.error('❌ El usuario no tiene estrategia configurada. Créala desde /strategy.')
    process.exit(1)
  }

  // Cargamos el catálogo completo para poder buscar por code.
  const [allConditions, allRules] = await Promise.all([
    prisma.entryCondition.findMany(),
    prisma.behavioralRule.findMany(),
  ])

  const conditionByCode = new Map(allConditions.map((c) => [c.code, c]))
  const ruleByCode      = new Map(allRules.map((r) => [r.code, r]))

  // Cargamos los vínculos activos de la estrategia para resolverlos.
  const [strategyConditions, strategyRules] = await Promise.all([
    prisma.strategyCondition.findMany({ where: { strategyId: strategy.id } }),
    prisma.strategyRule.findMany({ where: { strategyId: strategy.id } }),
  ])

  // Limpiamos TODAS las sesiones e intenciones de prueba del usuario.
  // Incluye hoy y fechas futuras para que re-ejecutar el seed siempre
  // deje un estado limpio y no bloquee el flujo de /session/new.
  const sessionsToDelete = await prisma.session.findMany({
    where: { userId: user.id },
    select: { id: true },
  })
  const sessionIds = sessionsToDelete.map((s) => s.id)

  if (sessionIds.length > 0) {
    // Borramos trades y violaciones en cascada vía FK, pero lo hacemos
    // explícitamente para ser claros sobre lo que se elimina.
    const tradeIds = (await prisma.trade.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { id: true },
    })).map((t) => t.id)

    await prisma.tradeViolation.deleteMany({ where: { tradeId: { in: tradeIds } } })
    await prisma.sessionViolation.deleteMany({ where: { sessionId: { in: sessionIds } } })
    await prisma.trade.deleteMany({ where: { sessionId: { in: sessionIds } } })
    await prisma.session.deleteMany({ where: { id: { in: sessionIds } } })
  }

  await prisma.dailyIntention.deleteMany({
    where: { userId: user.id },
  })

  console.log(`  Datos previos limpiados. Creando ${TEST_SESSIONS.length} sesiones de prueba...\n`)

  let createdCount = 0

  for (const sessionSpec of TEST_SESSIONS) {
    const date = daysAgo(sessionSpec.daysBack)

    // Creamos la intención diaria (requerida antes de la sesión).
    const intention = await prisma.dailyIntention.create({
      data: {
        userId:            user.id,
        strategyId:        strategy.id,
        date,
        maxTrades:         sessionSpec.maxTrades,
        tradingHoursStart: strategy.tradingHoursStart,
        tradingHoursEnd:   strategy.tradingHoursEnd,
        emotionalState:    sessionSpec.emotionalState,
        notes:             sessionSpec.notes,
        // confirmedAt marca que el trader revisó su plan antes de operar
        confirmedAt:       new Date(date.getTime() + 5 * 60 * 1000), // 5 min después
      },
    })

    // Calculamos el ICO para esta sesión antes de crearla.
    // Necesitamos conocer la cantidad de condiciones/reglas activas.
    const activeConditions = strategyConditions.filter((sc) => sc.isActive)
    const activeRules      = strategyRules.filter((sr) => sr.isActive)

    // Resolvemos las violaciones de cada trade.
    const tradesWithViolations = sessionSpec.trades.map((t) => {
      const condViolations = t.violatedConditionCodes.map((code) => {
        const condition = conditionByCode.get(code)
        if (!condition) throw new Error(`Condición no encontrada: ${code}`)
        return { conditionId: condition.id, type: 'CONDITION_VIOLATION' as const }
      })

      const ruleViolations = t.violatedRuleCodesPerTrade.map((code) => {
        const rule = ruleByCode.get(code)
        if (!rule) throw new Error(`Regla no encontrada: ${code}`)
        return { ruleId: rule.id, type: 'RULE_VIOLATION' as const }
      })

      return { ...t, condViolations, ruleViolations }
    })

    // Calculamos el ICO según la fórmula del sistema.
    const Ts        = tradesWithViolations.length
    const C_activas = activeConditions.length

    // Contamos reglas activas por scope para el denominador Rs.
    // Usamos allRules (por ID) porque strategyRules solo tiene ruleId, no el scope.
    let ruleTradeCount   = 0
    let ruleSessionCount = 0
    for (const sr of activeRules) {
      const rule = allRules.find((r) => r.id === sr.ruleId)
      if (rule?.scope === 'PER_TRADE')   ruleTradeCount++
      if (rule?.scope === 'PER_SESSION') ruleSessionCount++
    }

    const Rs = Ts * C_activas + Ts * ruleTradeCount + ruleSessionCount

    const tradeLevelViolations = tradesWithViolations.reduce(
      (sum, t) => sum + t.condViolations.length + t.ruleViolations.length, 0,
    )

    const sessionViolationsCount = sessionSpec.violatedSessionRuleCodes.length
    const Vs  = tradeLevelViolations + sessionViolationsCount
    const ico = Rs === 0 ? 1.0 : Math.max(0, Math.min(1, 1 - Vs / Rs))
    const icoScore = Math.round(ico * 10000) / 10000

    // Creamos la sesión con su timestamp de creación y cierre realistas.
    const sessionStart = new Date(date.getTime() + 30 * 60 * 1000) // 30 min después
    const sessionEnd   = new Date(date.getTime() + 2 * 60 * 60 * 1000) // 2h después

    const createdSession = await prisma.session.create({
      data: {
        userId:      user.id,
        intentionId: intention.id,
        date,
        status:      'CLOSED',
        icoScore,
        createdAt:   sessionStart,
        closedAt:    sessionEnd,
      },
    })

    // Creamos los trades con sus violaciones.
    for (const t of tradesWithViolations) {
      await prisma.trade.create({
        data: {
          sessionId:  createdSession.id,
          direction:  t.direction,
          result:     t.result,
          pnlAmount:  t.pnlAmount,
          notes:      t.notes,
          violations: {
            create: [...t.condViolations, ...t.ruleViolations],
          },
        },
      })
    }

    // Creamos las violaciones de sesión (PER_SESSION).
    for (const code of sessionSpec.violatedSessionRuleCodes) {
      const rule = ruleByCode.get(code)
      if (!rule) throw new Error(`Regla PER_SESSION no encontrada: ${code}`)
      await prisma.sessionViolation.create({
        data: { sessionId: createdSession.id, ruleId: rule.id },
      })
    }

    createdCount++
    const dateStr = date.toISOString().split('T')[0]
    console.log(`  ✓ Sesión ${createdCount}: ${dateStr} | ${sessionSpec.emotionalState} | ICO: ${Math.round(icoScore * 100)}% | ${Vs}/${Rs} violaciones`)
  }

  console.log(`\n✅ ${createdCount} sesiones de prueba creadas correctamente.`)
  console.log('   Ve a /history para ver el historial y el gráfico de evolución.')
}

main()
  .catch((e) => {
    console.error('❌ Error generando datos de prueba:', e.message)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
