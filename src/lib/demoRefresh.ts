// ─────────────────────────────────────────────────────────────────────────────
// demoRefresh.ts — mantiene al día el historial del demo en la base de datos.
//
// El historial lo genera src/lib/demoDataset.ts a partir de la fecha de hoy.
// Aquí se comprueba si lo que hay en la base de datos corresponde a hoy y, si
// no, se borra y se vuelve a escribir. Pasa como mucho una vez al día: la
// primera visita al demo de cada día.
//
// ── Quién escribe ───────────────────────────────────────────────────────────
// Esto usa `prisma` (la conexión completa), no la de solo lectura del demo.
// Lo lanza el servidor por su cuenta, nunca a petición de lo que mande el
// visitante: no recibe ningún dato suyo y solo toca filas de la cuenta demo.
// El rol kosmos_demo sigue sin poder escribir nada.
//
// ── Dos visitas a la vez ────────────────────────────────────────────────────
// Si dos personas entran al demo a la vez justo cuando toca regenerar, las dos
// verían los datos viejos. La regeneración va en una transacción que empieza
// cogiendo un cerrojo de Postgres (pg_advisory_xact_lock): la segunda espera a
// que termine la primera, vuelve a mirar, ve que ya está al día y no hace nada.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma'
import { DEMO_USER_EMAIL } from '@/lib/demo'
import { getStartOfToday } from '@/lib/dates'
import {
  DEMO_ACTIVE_CONDITIONS,
  DEMO_ACTIVE_SESSION_RULES,
  DEMO_ACTIVE_TRADE_RULES,
  DEMO_CUSTOM_CONDITION,
  DEMO_CUSTOM_RULE,
  DEMO_DATASET_VERSION,
  DEMO_STRATEGY,
  buildDemoDataset,
  type DemoDay,
} from '@/lib/demoDataset'

// Número arbitrario que identifica este cerrojo entre todos los de Postgres.
const LOCK_ID = 7_202_609

// Recuerda en memoria el último día comprobado, para no consultar la base de
// datos en cada página que visita el demo. Cada instancia del servidor lo
// comprueba una vez al día como mucho.
let checkedDay: string | null = null

// ¿Coincide lo guardado con lo que toca hoy? Basta con mirar la última sesión:
// su id lleva la fecha y la versión del generador.
async function isFresh(
  db: Pick<typeof prisma, 'session' | 'strategy'>,
  userId: string,
  expectedLast: DemoDay | undefined,
) {
  const [last, strategy] = await Promise.all([
    db.session.findFirst({ where: { userId }, orderBy: { date: 'desc' }, select: { id: true } }),
    db.strategy.findUnique({ where: { userId }, select: { name: true } }),
  ])
  return last?.id === expectedLast?.sessionId && strategy?.name === DEMO_STRATEGY.name
}

// Deja el demo al día. No lanza: si algo falla lo registra y el demo sigue
// funcionando con lo que hubiera.
export async function ensureDemoDataFresh({ force = false } = {}): Promise<void> {
  const today = getStartOfToday().toISOString()
  if (!force && checkedDay === today) return

  try {
    const user = await prisma.user.findUnique({ where: { email: DEMO_USER_EMAIL }, select: { id: true } })
    if (!user) return

    const days = buildDemoDataset()
    const expectedLast = days[days.length - 1]

    if (!force && (await isFresh(prisma, user.id, expectedLast))) {
      checkedDay = today
      return
    }

    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_ID})`
        if (!force && (await isFresh(tx, user.id, expectedLast))) return
        await rewriteDemoData(tx, user.id, days)
      },
      { timeout: 30_000, maxWait: 10_000 },
    )
    checkedDay = today
  } catch (err) {
    console.error('[demoRefresh] no se pudo regenerar el demo:', err)
  }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

async function rewriteDemoData(tx: Tx, userId: string, days: DemoDay[]) {
  const v = DEMO_DATASET_VERSION

  // ── 1. Borrar el historial anterior ──────────────────────────────────────
  // Borrar las sesiones arrastra en cascada trades y violaciones. Las
  // intenciones van después porque cada sesión apunta a la suya.
  await tx.session.deleteMany({ where: { userId } })
  await tx.dailyIntention.deleteMany({ where: { userId } })

  // ── 2. Condición y regla personalizadas del demo ─────────────────────────
  const customCondition = await tx.entryCondition.upsert({
    where: { code: DEMO_CUSTOM_CONDITION.code },
    create: { ...DEMO_CUSTOM_CONDITION, isCustom: true, userId },
    update: { ...DEMO_CUSTOM_CONDITION, isCustom: true, isActive: true, userId },
  })
  const customRule = await tx.behavioralRule.upsert({
    where: { code: DEMO_CUSTOM_RULE.code },
    create: { ...DEMO_CUSTOM_RULE, isCustom: true, userId },
    update: { ...DEMO_CUSTOM_RULE, isCustom: true, isActive: true, userId },
  })

  // ── 3. Estrategia ────────────────────────────────────────────────────────
  // Se conserva la fila (y su id) y se reescriben sus datos. La fecha de
  // creación se pone unos días antes del primer día del historial.
  const strategyCreatedAt = new Date(days[0].date.getTime() - 6 * 86_400_000)
  const strategy = await tx.strategy.upsert({
    where: { userId },
    create: { userId, ...DEMO_STRATEGY, createdAt: strategyCreatedAt },
    update: { ...DEMO_STRATEGY, createdAt: strategyCreatedAt },
  })

  // Vínculos con el catálogo: todo lo ofrecido por el sistema más lo propio,
  // activo solo lo que usa la estrategia de ejemplo.
  const [conditions, rules] = await Promise.all([
    tx.entryCondition.findMany({ where: { OR: [{ isCustom: false, isActive: true }, { id: customCondition.id }] } }),
    tx.behavioralRule.findMany({ where: { OR: [{ isCustom: false, isActive: true }, { id: customRule.id }] } }),
  ])
  const activeRules = [...DEMO_ACTIVE_TRADE_RULES, ...DEMO_ACTIVE_SESSION_RULES]

  await tx.strategyCondition.deleteMany({ where: { strategyId: strategy.id } })
  await tx.strategyRule.deleteMany({ where: { strategyId: strategy.id } })
  await tx.strategyCondition.createMany({
    data: conditions.map((c) => ({
      id: `demo${v}sc${c.code}`,
      strategyId: strategy.id,
      conditionId: c.id,
      isActive: DEMO_ACTIVE_CONDITIONS.includes(c.code),
    })),
  })
  await tx.strategyRule.createMany({
    data: rules.map((r) => ({
      id: `demo${v}sr${r.code}`,
      strategyId: strategy.id,
      ruleId: r.id,
      isActive: activeRules.includes(r.code),
    })),
  })

  // ── 4. Historial ─────────────────────────────────────────────────────────
  const conditionId = new Map(conditions.map((c) => [c.code, c.id]))
  const ruleId = new Map(rules.map((r) => [r.code, r.id]))

  await tx.dailyIntention.createMany({
    data: days.map((d) => ({
      id: d.intentionId,
      userId,
      strategyId: strategy.id,
      date: d.date,
      maxTrades: DEMO_STRATEGY.maxTrades,
      tradingHoursStart: DEMO_STRATEGY.tradingHoursStart,
      tradingHoursEnd: DEMO_STRATEGY.tradingHoursEnd,
      emotionalState: d.emotionalState,
      notes: d.notes,
      confirmedAt: d.confirmedAt,
      createdAt: d.intentionCreatedAt,
    })),
  })

  await tx.session.createMany({
    data: days.map((d) => ({
      id: d.sessionId,
      userId,
      intentionId: d.intentionId,
      date: d.date,
      status: 'CLOSED',
      icoScore: d.icoScore,
      createdAt: d.openedAt,
      closedAt: d.closedAt,
    })),
  })

  await tx.trade.createMany({
    data: days.flatMap((d) =>
      d.trades.map((t) => ({
        id: t.id,
        sessionId: d.sessionId,
        timestamp: t.timestamp,
        direction: t.direction,
        result: t.result,
        asset: t.asset,
        pnlAmount: t.pnlAmount,
        notes: t.notes,
        createdAt: t.timestamp,
      })),
    ),
  })

  await tx.tradeViolation.createMany({
    data: days.flatMap((d) =>
      d.trades.flatMap((t) => [
        ...t.conditionCodes.map((code, n) => ({
          id: `${t.id}c${n}`,
          tradeId: t.id,
          conditionId: conditionId.get(code)!,
          type: 'CONDITION_VIOLATION',
          createdAt: t.timestamp,
        })),
        ...t.ruleCodes.map((code, n) => ({
          id: `${t.id}r${n}`,
          tradeId: t.id,
          ruleId: ruleId.get(code)!,
          type: 'RULE_VIOLATION',
          createdAt: t.timestamp,
        })),
      ]),
    ),
  })

  await tx.sessionViolation.createMany({
    data: days.flatMap((d) =>
      d.sessionRuleCodes.map((code, n) => ({
        id: `${d.sessionId}v${n}`,
        sessionId: d.sessionId,
        ruleId: ruleId.get(code)!,
        createdAt: d.closedAt,
      })),
    ),
  })
}
