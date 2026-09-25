// ─────────────────────────────────────────────────────────────────────────────
// demoActions.ts — las escrituras del flujo de sesión, versión demo.
//
// Cada función hace lo mismo que su ruta real (mismas validaciones, mismo
// cálculo del ICO, misma forma de respuesta), pero en vez de guardar en la
// base de datos actualiza la cookie de src/lib/demoSandbox.ts. Las rutas
// reales llaman aquí al principio cuando la sesión es la del demo:
//
//   POST /api/intention          → createIntention
//   POST /api/intention/confirm  → confirmIntention
//   POST /api/session/trade      → registerTrade
//   POST /api/session/close      → closeSession
//
// Las lecturas (estrategia, catálogo) van con la conexión de solo lectura del
// demo. Ninguna de estas funciones escribe en Postgres.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'
import type { PrismaClient } from '@prisma/client'
import { computeIco } from '@/lib/ico'
import { getStartOfToday } from '@/lib/dates'
import {
  DEMO_LIMITS,
  DemoSandboxFullError,
  hydrateSandbox,
  newDemoId,
  readSandbox,
  writeSandbox,
  type SandboxState,
} from '@/lib/demoSandbox'

const VALID_EMOTIONAL_STATES = ['NEUTRAL', 'ANXIOUS', 'CONFIDENT', 'FRUSTRATED', 'TIRED']
const VALID_DIRECTIONS = ['LONG', 'SHORT'] as const
const VALID_RESULTS = ['WIN', 'LOSS', 'BREAKEVEN'] as const

type Ctx = { db: PrismaClient; userId: string }

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

// Guarda y responde; si la cookie ya no da para más, lo dice claro.
async function save(state: SandboxState, respond: () => Promise<NextResponse>) {
  try {
    await writeSandbox(state)
  } catch (err) {
    if (err instanceof DemoSandboxFullError) {
      return error('El demo no admite más datos en esta sesión. Ciérrala o vuelve a entrar para empezar de cero.', 400)
    }
    throw err
  }
  return respond()
}

// La intención con la forma que devuelve GET /api/intention (sesión reducida).
async function intentionResponse(state: SandboxState, { db, userId }: Ctx, status = 200) {
  const { intention, session } = await hydrateSandbox(state, db, userId)
  return NextResponse.json(
    {
      ...intention,
      session: session && {
        id: session.id,
        status: session.status,
        icoScore: session.icoScore,
        createdAt: session.createdAt,
        closedAt: session.closedAt,
      },
    },
    { status },
  )
}

// ── GET /api/intention ──────────────────────────────────────────────────────
export async function getIntention(ctx: Ctx) {
  const state = await readSandbox()
  if (!state) return error('No existe intención para el día de hoy', 404)
  return intentionResponse(state, ctx)
}

// ── POST /api/intention ─────────────────────────────────────────────────────
export async function createIntention(request: Request, ctx: Ctx) {
  const strategy = await ctx.db.strategy.findUnique({
    where: { userId: ctx.userId },
    select: { id: true, maxTrades: true, tradingHoursStart: true, tradingHoursEnd: true },
  })
  if (!strategy) {
    return error('Debes configurar tu estrategia antes de crear una intención diaria', 409)
  }

  if (await readSandbox()) return error('Ya has creado una intención para hoy', 409)

  const { emotionalState, notes } = await request.json()
  if (!VALID_EMOTIONAL_STATES.includes(emotionalState)) {
    return error(`El estado emocional debe ser uno de: ${VALID_EMOTIONAL_STATES.join(', ')}`, 400)
  }
  const cleanNotes = typeof notes === 'string' ? notes.trim() || null : null
  if (cleanNotes && cleanNotes.length > DEMO_LIMITS.intentionNotes) {
    return error(`En el demo las notas del plan admiten hasta ${DEMO_LIMITS.intentionNotes} caracteres`, 400)
  }

  const state: SandboxState = {
    day: getStartOfToday().toISOString(),
    intention: {
      id: newDemoId(),
      createdAt: new Date().toISOString(),
      strategyId: strategy.id,
      maxTrades: strategy.maxTrades,
      tradingHoursStart: strategy.tradingHoursStart,
      tradingHoursEnd: strategy.tradingHoursEnd,
      emotionalState,
      notes: cleanNotes,
      confirmedAt: null,
    },
    session: null,
  }
  return save(state, () => intentionResponse(state, ctx, 201))
}

// ── POST /api/intention/confirm ─────────────────────────────────────────────
export async function confirmIntention(ctx: Ctx) {
  const state = await readSandbox()
  if (!state) return error('No existe intención para hoy. Crea una antes de confirmar.', 404)

  // Igual que la ruta real: confirmar dos veces no hace nada.
  if (state.intention.confirmedAt) return intentionResponse(state, ctx)

  const now = new Date().toISOString()
  state.intention.confirmedAt = now
  state.session = {
    id: newDemoId(),
    createdAt: now,
    status: 'OPEN',
    closedAt: null,
    icoScore: null,
    trades: [],
    sessionRuleIds: [],
  }
  return save(state, () => intentionResponse(state, ctx, 201))
}

// ── POST /api/session/trade ─────────────────────────────────────────────────
export async function registerTrade(request: Request, ctx: Ctx) {
  const state = await readSandbox()
  const session = state?.session
  if (!state || !session || session.status !== 'OPEN') {
    return error('No hay sesión activa hoy. Abre una sesión antes de registrar operaciones.', 400)
  }
  if (session.trades.length >= DEMO_LIMITS.trades) {
    return error(`El demo admite hasta ${DEMO_LIMITS.trades} operaciones por sesión`, 400)
  }

  const strategy = await ctx.db.strategy.findUnique({
    where: { userId: ctx.userId },
    include: {
      conditions: { where: { isActive: true } },
      rules: { where: { isActive: true }, include: { rule: true } },
    },
  })
  if (!strategy) return error('No tienes estrategia configurada', 409)

  const { direction, result, asset, pnlAmount, notes, violations = {} } = await request.json()
  const { conditions: violatedConditionIds = [], rules: violatedRuleIds = [] } = violations as {
    conditions?: string[]
    rules?: string[]
  }

  if (!VALID_DIRECTIONS.includes(direction)) return error('La dirección debe ser LONG o SHORT', 400)
  if (!VALID_RESULTS.includes(result)) return error('El resultado debe ser WIN, LOSS o BREAKEVEN', 400)
  if (pnlAmount !== undefined && pnlAmount !== null && typeof pnlAmount !== 'number') {
    return error('El P&L debe ser un número', 400)
  }
  if (asset !== undefined && asset !== null && typeof asset !== 'string') {
    return error('El activo debe ser un texto', 400)
  }
  const cleanNotes = typeof notes === 'string' ? notes.trim() || null : null
  if (cleanNotes && cleanNotes.length > DEMO_LIMITS.tradeNotes) {
    return error(`En el demo las notas de cada operación admiten hasta ${DEMO_LIMITS.tradeNotes} caracteres`, 400)
  }

  // Mismo mapeo que la ruta real: el cliente manda ids de StrategyCondition /
  // StrategyRule y guardamos los del catálogo.
  const conditionMap = new Map(strategy.conditions.map((sc) => [sc.id, sc.conditionId]))
  const perTradeRuleMap = new Map(
    strategy.rules.filter((sr) => sr.rule.scope === 'PER_TRADE').map((sr) => [sr.id, sr.ruleId]),
  )
  for (const id of violatedConditionIds) {
    if (!conditionMap.has(id)) {
      return error(`La condición '${id}' no existe o no está activa en tu estrategia`, 400)
    }
  }
  for (const id of violatedRuleIds) {
    if (!perTradeRuleMap.has(id)) {
      return error(`La regla '${id}' no existe, no está activa, o es una regla de sesión (no de operación)`, 400)
    }
  }

  const tradeId = newDemoId()
  session.trades.push({
    id: tradeId,
    timestamp: new Date().toISOString(),
    direction,
    result,
    asset: typeof asset === 'string' ? asset.trim().toUpperCase().slice(0, 12) || null : null,
    pnlAmount: pnlAmount ?? null,
    notes: cleanNotes,
    conditionIds: violatedConditionIds.map((id) => conditionMap.get(id)!),
    ruleIds: violatedRuleIds.map((id) => perTradeRuleMap.get(id)!),
  })

  return save(state, async () => {
    const hydrated = await hydrateSandbox(state, ctx.db, ctx.userId)
    const trade = hydrated.session!.trades.find((t) => t.id === tradeId)
    return NextResponse.json(trade, { status: 201 })
  })
}

// ── POST /api/session/close ─────────────────────────────────────────────────
export async function closeSession(request: Request, ctx: Ctx) {
  const state = await readSandbox()
  const session = state?.session
  if (!state || !session || session.status !== 'OPEN') return error('No hay sesión activa hoy', 400)

  const strategy = await ctx.db.strategy.findUnique({
    where: { userId: ctx.userId },
    include: {
      conditions: { where: { isActive: true } },
      rules: { where: { isActive: true }, include: { rule: true } },
    },
  })
  if (!strategy) return error('No tienes estrategia configurada', 409)

  const { sessionViolations: raw = [] } = await request.json()
  const uniqueIds: string[] = [...new Set<string>(raw)]

  const perSessionRules = strategy.rules.filter((sr) => sr.rule.scope === 'PER_SESSION')
  const perSessionRuleMap = new Map(perSessionRules.map((sr) => [sr.id, sr.ruleId]))
  for (const id of uniqueIds) {
    if (!perSessionRuleMap.has(id)) {
      return error(`La regla '${id}' no existe, no está activa, o no es una regla de sesión`, 400)
    }
  }

  // El mismo cálculo que la ruta real, con la misma función.
  const tradeViolations = session.trades.reduce(
    (sum, t) => sum + t.conditionIds.length + t.ruleIds.length,
    0,
  )
  session.icoScore = computeIco({
    Ts: session.trades.length,
    cActive: strategy.conditions.length,
    rTrade: strategy.rules.filter((sr) => sr.rule.scope === 'PER_TRADE').length,
    rSession: perSessionRules.length,
    vTotal: tradeViolations + uniqueIds.length,
  })
  session.sessionRuleIds = uniqueIds.map((id) => perSessionRuleMap.get(id)!)
  session.status = 'CLOSED'
  session.closedAt = new Date().toISOString()

  return save(state, async () => {
    const { session: closed } = await hydrateSandbox(state, ctx.db, ctx.userId)
    return NextResponse.json(closed)
  })
}

// ── GET /api/session/active ─────────────────────────────────────────────────
export async function getActiveSession(ctx: Ctx) {
  const state = await readSandbox()
  if (!state?.session || state.session.status !== 'OPEN') {
    return error('No hay sesión abierta hoy', 404)
  }
  const [{ session }, previous] = await Promise.all([
    hydrateSandbox(state, ctx.db, ctx.userId),
    ctx.db.session.findFirst({
      where: { userId: ctx.userId, status: 'CLOSED' },
      orderBy: { date: 'desc' },
      select: { date: true },
    }),
  ])
  return NextResponse.json({ ...session, previousSessionDate: previous?.date ?? null })
}
