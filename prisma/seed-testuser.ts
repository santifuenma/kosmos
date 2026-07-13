// ─────────────────────────────────────────────────────────────────────────────
// seed-testuser.ts — datos de demostración para usuarioprueba@gmail.com.
//
// Genera un historial realista de junio y julio de 2026 (intenciones + sesiones
// cerradas + trades + violaciones) para el usuario de prueba, coherente con la
// fórmula real del ICO usada en /api/session/close:
//
//   Rs  = Ts × C_activas + Ts × R_trade + R_session
//   ICO = clamp(1 − Vs / Rs, 0, 1)   (redondeado a 4 decimales)
//
// La estrategia del usuario de prueba se configura igual que la de la cuenta
// principal: 4 condiciones activas + las 4 reglas PER_SESSION activas
// (C_activas = 4, R_trade = 0, R_session = 4 → Rs = 4·Ts + 4), maxTrades = 4.
//
// Solo genera datos con violaciones de ítems ACTIVOS (como haría la app real),
// para que las puntuaciones queden dentro de un rango creíble.
//
// Es idempotente para el usuario de prueba: borra sus sesiones e intenciones
// previas antes de recrearlas. NO toca los datos de otros usuarios.
//
// Ejecutar:  npx tsx prisma/seed-testuser.ts
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const TEST_EMAIL = 'usuarioprueba@gmail.com'

// Configuración de estrategia a replicar (misma que la cuenta principal).
const MAX_TRADES = 4
const HOURS_START = '09:00'
const HOURS_END = '11:30'
const ACTIVE_CONDITIONS = ['TREND_CONFIRM', 'VOLUME_CONFIRM', 'INDICATOR_SIGNAL', 'RR_ACCEPTABLE']
const ACTIVE_SESSION_RULES = ['MAX_TRADES_LIMIT', 'TRADING_HOURS', 'NO_REVENGE_TRADE', 'STRATEGY_FOLLOWED']

// ── RNG determinista (mulberry32) para que el seed sea reproducible ──────────
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = mulberry32(20260705)
const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)]
const chance = (p: number) => rng() < p
const randInt = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1))

const ASSETS = ['QQQ', 'SPY', 'NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMD', 'META', 'AMZN']

const NOTES_GOOD = [
  'Plan claro, esperé las zonas y ejecuté con paciencia.',
  'Buen día, dejé correr los ganadores.',
  'Respeté el horario y el máximo de operaciones.',
  'Mercado con tendencia limpia, seguí el plan.',
  null, null,
]
const NOTES_MIXED = [
  'Día correcto, aunque forcé alguna entrada de más.',
  'Alguna operación sin toda la confirmación, pero controlado.',
  'Sesión aceptable, margen de mejora en la selección.',
  null,
]
const NOTES_BAD = [
  'Me dejé llevar, entré por impulso tras la primera pérdida.',
  'Demasiadas operaciones, perdí la disciplina.',
  'Día para olvidar: revenge trading después de un stop.',
  'Rompí el plan buscando recuperar, error.',
]

type TradeGen = {
  time: string
  direction: 'LONG' | 'SHORT'
  result: 'WIN' | 'LOSS' | 'BREAKEVEN'
  asset: string
  pnl: number
  notes: string | null
  violatedConditionCodes: string[]
}

type DayGen = {
  date: Date
  emotionalState: string
  notes: string | null
  trades: TradeGen[]
  sessionRuleCodes: string[]
}

// Genera una hora "HH:mm" dentro del horario, en orden creciente.
function tradeTime(index: number, total: number): string {
  // Repartimos las operaciones entre 09:05 y 11:20.
  const startMin = 9 * 60 + 5
  const endMin = 11 * 60 + 20
  const span = endMin - startMin
  const base = startMin + Math.floor((span * (index + 0.5)) / total) + randInt(-8, 8)
  const clamped = Math.max(startMin, Math.min(endMin, base))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function buildDay(date: Date): DayGen {
  const roll = rng()
  const tier: 'good' | 'mixed' | 'bad' = roll < 0.55 ? 'good' : roll < 0.85 ? 'mixed' : 'bad'

  const emotionalState =
    tier === 'good' ? pick(['CONFIDENT', 'NEUTRAL', 'CONFIDENT', 'NEUTRAL'])
      : tier === 'mixed' ? pick(['NEUTRAL', 'ANXIOUS', 'TIRED'])
        : pick(['FRUSTRATED', 'ANXIOUS', 'TIRED'])

  const notes = tier === 'good' ? pick(NOTES_GOOD) : tier === 'mixed' ? pick(NOTES_MIXED) : pick(NOTES_BAD)

  const nTrades = tier === 'good' ? randInt(2, 3) : tier === 'mixed' ? randInt(2, 4) : randInt(3, 5)

  const trades: TradeGen[] = []
  for (let i = 0; i < nTrades; i++) {
    // Probabilidad de resultado por tier.
    const r = rng()
    let result: 'WIN' | 'LOSS' | 'BREAKEVEN'
    if (tier === 'good') result = r < 0.7 ? 'WIN' : r < 0.85 ? 'BREAKEVEN' : 'LOSS'
    else if (tier === 'mixed') result = r < 0.5 ? 'WIN' : r < 0.6 ? 'BREAKEVEN' : 'LOSS'
    else result = r < 0.3 ? 'WIN' : r < 0.38 ? 'BREAKEVEN' : 'LOSS'

    const pnl =
      result === 'WIN' ? randInt(60, 400)
        : result === 'LOSS' ? -randInt(50, 260)
          : randInt(-8, 8)

    // Violaciones de condición (solo de las activas). Más probables en peores días.
    const violatedConditionCodes: string[] = []
    const vProb = tier === 'good' ? 0.12 : tier === 'mixed' ? 0.35 : 0.6
    for (const code of ACTIVE_CONDITIONS) {
      if (chance(vProb / ACTIVE_CONDITIONS.length + (result === 'LOSS' ? 0.06 : 0))) {
        violatedConditionCodes.push(code)
      }
    }

    trades.push({
      time: tradeTime(i, nTrades),
      direction: pick(['LONG', 'SHORT']),
      result,
      asset: pick(ASSETS),
      pnl,
      notes: chance(0.25) ? pick([...NOTES_MIXED, ...NOTES_GOOD].filter(Boolean) as string[]) : null,
      violatedConditionCodes,
    })
  }

  // Violaciones de sesión (PER_SESSION), solo de reglas activas.
  const sessionRuleCodes: string[] = []
  if (nTrades > MAX_TRADES) sessionRuleCodes.push('MAX_TRADES_LIMIT')
  if (tier === 'bad' && chance(0.7)) sessionRuleCodes.push('NO_REVENGE_TRADE')
  if (tier === 'bad' && chance(0.4)) sessionRuleCodes.push('STRATEGY_FOLLOWED')
  if (tier === 'mixed' && chance(0.15)) sessionRuleCodes.push('NO_REVENGE_TRADE')

  return { date, emotionalState, notes, trades, sessionRuleCodes }
}

// Lista de días laborables (Lun–Vie) entre dos fechas, en UTC.
function tradingDays(from: Date, to: Date): Date[] {
  const days: Date[] = []
  const d = new Date(from)
  while (d <= to) {
    const dow = d.getUTCDay() // 0 = domingo, 6 = sábado
    if (dow >= 1 && dow <= 5) days.push(new Date(d))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return days
}

async function main() {
  console.log('Generando historial de junio–julio para el usuario de prueba...\n')

  const user = await prisma.user.findUnique({ where: { email: TEST_EMAIL } })
  if (!user) throw new Error(`No existe el usuario ${TEST_EMAIL}`)

  const [allConditions, allRules] = await Promise.all([
    prisma.entryCondition.findMany(),
    prisma.behavioralRule.findMany(),
  ])
  const conditionByCode = new Map(allConditions.map((c) => [c.code, c]))
  const ruleByCode = new Map(allRules.map((r) => [r.code, r]))

  // ── 1. Estrategia del usuario de prueba (crear o reconfigurar) ─────────────
  let strategy = await prisma.strategy.findUnique({ where: { userId: user.id } })
  if (!strategy) {
    strategy = await prisma.strategy.create({
      data: {
        userId: user.id,
        name: 'Scalping disciplinado',
        description: 'Operativa intradía en horario de apertura con foco en disciplina.',
        maxTrades: MAX_TRADES,
        tradingHoursStart: HOURS_START,
        tradingHoursEnd: HOURS_END,
        conditions: { create: allConditions.map((c) => ({ conditionId: c.id, isActive: ACTIVE_CONDITIONS.includes(c.code) })) },
        rules: { create: allRules.map((r) => ({ ruleId: r.id, isActive: ACTIVE_SESSION_RULES.includes(r.code) })) },
      },
    })
    console.log('  ✓ Estrategia creada para el usuario de prueba.')
  } else {
    // Aseguramos los flags activos correctos por si ya existía.
    for (const c of allConditions) {
      await prisma.strategyCondition.updateMany({
        where: { strategyId: strategy.id, conditionId: c.id },
        data: { isActive: ACTIVE_CONDITIONS.includes(c.code) },
      })
    }
    for (const r of allRules) {
      await prisma.strategyRule.updateMany({
        where: { strategyId: strategy.id, ruleId: r.id },
        data: { isActive: ACTIVE_SESSION_RULES.includes(r.code) },
      })
    }
    console.log('  ✓ Estrategia existente reconfigurada.')
  }

  // ── 2. Limpieza idempotente de datos previos del usuario de prueba ─────────
  const prevSessions = await prisma.session.findMany({ where: { userId: user.id }, select: { id: true } })
  const prevIds = prevSessions.map((s) => s.id)
  if (prevIds.length > 0) {
    const tIds = (await prisma.trade.findMany({ where: { sessionId: { in: prevIds } }, select: { id: true } })).map((t) => t.id)
    await prisma.tradeViolation.deleteMany({ where: { tradeId: { in: tIds } } })
    await prisma.sessionViolation.deleteMany({ where: { sessionId: { in: prevIds } } })
    await prisma.trade.deleteMany({ where: { sessionId: { in: prevIds } } })
    await prisma.session.deleteMany({ where: { id: { in: prevIds } } })
  }
  await prisma.dailyIntention.deleteMany({ where: { userId: user.id } })

  // ── 3. Generar los días de junio (1) a julio (24) 2026 ─────────────────────
  const from = new Date(Date.UTC(2026, 5, 1)) // 1 junio 2026
  const to = new Date(Date.UTC(2026, 6, 24)) // 24 julio 2026
  const days = tradingDays(from, to)

  const C_activas = ACTIVE_CONDITIONS.length
  const R_trade = 0 // ninguna regla PER_TRADE activa
  const R_session = ACTIVE_SESSION_RULES.length

  let created = 0
  const monthCount: Record<string, number> = { '06': 0, '07': 0 }

  for (const date of days) {
    // El trader se salta ~18% de los días laborables (vacaciones, sin setup, etc.).
    if (chance(0.18)) continue

    const day = buildDay(date)

    const intention = await prisma.dailyIntention.create({
      data: {
        userId: user.id,
        strategyId: strategy.id,
        date,
        maxTrades: MAX_TRADES,
        tradingHoursStart: HOURS_START,
        tradingHoursEnd: HOURS_END,
        emotionalState: day.emotionalState,
        notes: day.notes,
        confirmedAt: new Date(date.getTime() + (8 * 60 + 45) * 60 * 1000), // 08:45 UTC
      },
    })

    const Ts = day.trades.length
    const Rs = Ts * C_activas + Ts * R_trade + R_session
    const tradeViolations = day.trades.reduce((s, t) => s + t.violatedConditionCodes.length, 0)
    const Vs = tradeViolations + day.sessionRuleCodes.length
    const ico = Rs === 0 ? 1 : Math.max(0, Math.min(1, 1 - Vs / Rs))
    const icoScore = Math.round(ico * 10000) / 10000

    const createdSession = await prisma.session.create({
      data: {
        userId: user.id,
        intentionId: intention.id,
        date,
        status: 'CLOSED',
        icoScore,
        createdAt: new Date(date.getTime() + 9 * 60 * 60 * 1000), // 09:00 UTC
        closedAt: new Date(date.getTime() + (11 * 60 + 45) * 60 * 1000), // 11:45 UTC
      },
    })

    for (const t of day.trades) {
      const [h, m] = t.time.split(':').map(Number)
      const ts = new Date(date.getTime() + (h * 60 + m) * 60 * 1000)
      await prisma.trade.create({
        data: {
          sessionId: createdSession.id,
          timestamp: ts,
          createdAt: ts,
          direction: t.direction,
          result: t.result,
          asset: t.asset,
          pnlAmount: t.pnl,
          notes: t.notes,
          violations: {
            create: t.violatedConditionCodes.map((code) => {
              const cond = conditionByCode.get(code)
              if (!cond) throw new Error(`Condición no encontrada: ${code}`)
              return { conditionId: cond.id, type: 'CONDITION_VIOLATION' as const }
            }),
          },
        },
      })
    }

    for (const code of day.sessionRuleCodes) {
      const rule = ruleByCode.get(code)
      if (!rule) throw new Error(`Regla PER_SESSION no encontrada: ${code}`)
      await prisma.sessionViolation.create({ data: { sessionId: createdSession.id, ruleId: rule.id } })
    }

    created++
    const iso = date.toISOString().split('T')[0]
    monthCount[iso.slice(5, 7)]++
    console.log(`  ✓ ${iso} | ${day.emotionalState.padEnd(10)} | ${Ts} trades | ICO ${Math.round(icoScore * 100)}% | ${Vs}/${Rs} viol`)
  }

  console.log(`\n✅ ${created} sesiones creadas (junio: ${monthCount['06']}, julio: ${monthCount['07']}).`)
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
