import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getStartOfToday, getStartOfTomorrow } from '@/lib/dates'
import { TEXT_LIMITS, optionalText, readJsonBody } from '@/lib/validation'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/session/trade
// Registra una operación en la sesión activa del día.
//
// Implementa el principio de "registro por excepción": el sistema asume que
// todo se cumplió correctamente. El trader SOLO envía las IDs de las
// condiciones/reglas que NO cumplió. Esto reduce la fricción durante la
// sesión real, donde hay presión de tiempo.
//
// Mapeo de IDs importante:
//   El cliente envía IDs de StrategyCondition y StrategyRule (los vínculos
//   intermedios entre estrategia y catálogo). El servidor los resuelve al
//   ID real del catálogo (EntryCondition y BehavioralRule) antes de guardar
//   en TradeViolation. Esto permite que el historial de violaciones sea
//   estable aunque el usuario cambie sus condiciones activas en el futuro.
// ─────────────────────────────────────────────────────────────────────────────

const VALID_DIRECTIONS = ['LONG', 'SHORT'] as const
const VALID_RESULTS    = ['WIN', 'LOSS', 'BREAKEVEN'] as const

type Direction = (typeof VALID_DIRECTIONS)[number]
type Result    = (typeof VALID_RESULTS)[number]

// Comprobaciones con forma de type guard (`v is Direction`) y no un simple
// booleano. Así TypeScript sabe que después del if el valor ya es uno de los
// permitidos, y deja de hacer falta afirmárselo con un `as` que no comprueba
// nada en tiempo de ejecución.
function isDirection(value: unknown): value is Direction {
  return VALID_DIRECTIONS.includes(value as Direction)
}

function isResult(value: unknown): value is Result {
  return VALID_RESULTS.includes(value as Result)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // Verificamos que existe sesión abierta hoy. No registramos operaciones
  // fuera de una sesión activa para mantener la integridad del historial.
  const todaySession = await prisma.session.findFirst({
    where: {
      userId: session.user.id,
      status: 'OPEN',
      date: {
        gte: getStartOfToday(),
        lt: getStartOfTomorrow(),
      },
    },
  })

  if (!todaySession) {
    return NextResponse.json(
      { error: 'No hay sesión activa hoy. Abre una sesión antes de registrar operaciones.' },
      { status: 400 },
    )
  }

  // Obtenemos la estrategia con sus condiciones y reglas activas para validar
  // que las violaciones enviadas pertenecen a la estrategia del usuario.
  const strategy = await prisma.strategy.findUnique({
    where: { userId: session.user.id },
    include: {
      conditions: {
        where: { isActive: true },
        include: { condition: true },
      },
      rules: {
        where: { isActive: true },
        include: { rule: true },
      },
    },
  })

  if (!strategy) {
    return NextResponse.json(
      { error: 'No tienes estrategia configurada' },
      { status: 409 },
    )
  }

  const body = await readJsonBody(request)
  if (!body) {
    return NextResponse.json({ error: 'El cuerpo de la petición no es JSON válido' }, { status: 400 })
  }

  const { direction, result, pnlAmount, violations = {} } = body

  // Las listas de violaciones vienen del cliente; si no son arrays, los bucles
  // de más abajo recorrerían cualquier cosa y reventarían con un 500.
  const { conditions: rawConditionIds = [], rules: rawRuleIds = [] } =
    (violations ?? {}) as Record<string, unknown>

  if (!Array.isArray(rawConditionIds) || !Array.isArray(rawRuleIds)) {
    return NextResponse.json(
      { error: 'Las violaciones deben venir como listas de ids' },
      { status: 400 },
    )
  }

  const violatedConditionIds = rawConditionIds as string[]
  const violatedRuleIds = rawRuleIds as string[]

  // ── Validaciones de campos obligatorios ──────────────────────────────────

  if (!isDirection(direction)) {
    return NextResponse.json(
      { error: 'La dirección debe ser LONG o SHORT' },
      { status: 400 },
    )
  }

  if (!isResult(result)) {
    return NextResponse.json(
      { error: 'El resultado debe ser WIN, LOSS o BREAKEVEN' },
      { status: 400 },
    )
  }

  // Number.isFinite descarta además NaN e Infinity, que son números para
  // typeof pero no valen como importe y entrarían tal cual en la columna.
  if (pnlAmount !== undefined && pnlAmount !== null && !Number.isFinite(pnlAmount)) {
    return NextResponse.json(
      { error: 'El P&L debe ser un número' },
      { status: 400 },
    )
  }

  const asset = optionalText(body.asset, 'El activo', TEXT_LIMITS.asset)
  if (!asset.ok) {
    return NextResponse.json({ error: asset.error }, { status: 400 })
  }

  const notes = optionalText(body.notes, 'Las notas', TEXT_LIMITS.notes)
  if (!notes.ok) {
    return NextResponse.json({ error: notes.error }, { status: 400 })
  }

  // ── Validación de violaciones de condiciones ─────────────────────────────
  // Verificamos que cada ID corresponde a un StrategyCondition activo del usuario.
  // Esto impide que alguien inyecte IDs de estrategias de otros traders.

  const activeConditionMap = new Map(strategy.conditions.map((sc) => [sc.id, sc]))

  for (const id of violatedConditionIds) {
    if (!activeConditionMap.has(id)) {
      return NextResponse.json(
        { error: `La condición '${id}' no existe o no está activa en tu estrategia` },
        { status: 400 },
      )
    }
  }

  // ── Validación de violaciones de reglas ──────────────────────────────────
  // Solo se aceptan reglas PER_TRADE: las PER_SESSION se registran al cerrar.

  const activePerTradeRuleMap = new Map(
    strategy.rules
      .filter((sr) => sr.rule.scope === 'PER_TRADE')
      .map((sr) => [sr.id, sr]),
  )

  for (const id of violatedRuleIds) {
    if (!activePerTradeRuleMap.has(id)) {
      return NextResponse.json(
        {
          error: `La regla '${id}' no existe, no está activa, o es una regla de sesión (no de operación)`,
        },
        { status: 400 },
      )
    }
  }

  // ── Creación atómica del trade y sus violaciones ─────────────────────────
  // Usamos el create anidado de Prisma para garantizar que el trade y sus
  // violaciones se crean juntos. Si alguna violación falla, no se crea el trade.

  try {
    const trade = await prisma.trade.create({
      data: {
        sessionId: todaySession.id,
        direction,
        result,
        asset: asset.value?.toUpperCase() ?? null,
        pnlAmount: (pnlAmount as number | null | undefined) ?? null,
        notes: notes.value,
        violations: {
          create: [
            // Mapeamos StrategyCondition.id → EntryCondition.id para TradeViolation.
            // La conditionId que almacenamos es la del catálogo (no el vínculo intermedio)
            // para que las violaciones sean legibles aunque la estrategia cambie.
            ...violatedConditionIds.map((strategyConditionId: string) => ({
              conditionId: activeConditionMap.get(strategyConditionId)!.conditionId,
              type: 'CONDITION_VIOLATION',
            })),
            // Ídem para reglas: mapeamos StrategyRule.id → BehavioralRule.id.
            ...violatedRuleIds.map((strategyRuleId: string) => ({
              ruleId: activePerTradeRuleMap.get(strategyRuleId)!.ruleId,
              type: 'RULE_VIOLATION',
            })),
          ],
        },
      },
      include: {
        violations: {
          include: {
            rule: true,
            condition: true,
          },
        },
      },
    })

    return NextResponse.json(trade, { status: 201 })
  } catch (err) {
    // El detalle va al log del servidor, no a la respuesta: los errores de
    // Prisma nombran modelos, columnas y restricciones, y eso le dibuja el
    // esquema a cualquiera que provoque un fallo a propósito.
    console.error('[POST /api/session/trade] prisma.trade.create failed:', err)
    return NextResponse.json(
      { error: 'No se pudo registrar la operación' },
      { status: 500 },
    )
  }
}
