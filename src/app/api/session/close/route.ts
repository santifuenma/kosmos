import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getStartOfToday, getStartOfTomorrow } from '@/lib/dates'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/session/close
// Cierra la sesión activa y calcula el ICO (Índice de Coherencia Operativa).
//
// El ICO mide la disciplina del trader independientemente del resultado
// financiero: un trader puede perder dinero pero tener ICO alto si siguió
// su estrategia, y viceversa.
//
// Fórmula:
//   Rs (instancias evaluables) = (Ts × C_activas) + (Ts × R_trade) + R_session
//   Vs (violaciones totales)   = violaciones de trades + violaciones de sesión
//   ICO = 1 - (Vs / Rs)
//
// Donde:
//   Ts        = número de trades en la sesión
//   C_activas = condiciones de entrada activas en la estrategia
//   R_trade   = reglas PER_TRADE activas
//   R_session = reglas PER_SESSION activas
//
// Rs = 0 cuando no hay trades ni reglas activas (el trader no operó con
// ninguna condición/regla configurada). En ese caso ICO = 1 por convención:
// no se puede evaluar pero tampoco se penaliza.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // Obtenemos la sesión con todos sus trades y violaciones para el cálculo del ICO.
  // Incluir trades aquí nos evita una segunda query durante el cálculo.
  const todaySession = await prisma.session.findFirst({
    where: {
      userId: session.user.id,
      status: 'OPEN',
      date: {
        gte: getStartOfToday(),
        lt: getStartOfTomorrow(),
      },
    },
    include: {
      trades: {
        include: { violations: true },
      },
    },
  })

  if (!todaySession) {
    return NextResponse.json(
      { error: 'No hay sesión activa hoy' },
      { status: 400 },
    )
  }

  // Obtenemos la estrategia con sus condiciones y reglas ACTIVAS para:
  //   a) Validar que las violaciones de sesión enviadas son correctas
  //   b) Contar C_activas, R_trade y R_session para el denominador del ICO
  const strategy = await prisma.strategy.findUnique({
    where: { userId: session.user.id },
    include: {
      conditions: {
        where: { isActive: true },
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

  const body = await request.json()
  const { sessionViolations: rawSessionViolationIds = [] } = body

  // Deduplicamos por si el cliente envía el mismo ID dos veces.
  const uniqueSessionViolationIds: string[] = [...new Set<string>(rawSessionViolationIds)]

  // ── Validación de violaciones de sesión ─────────────────────────────────
  // Solo se aceptan StrategyRule con scope PER_SESSION y que estén activas.
  // Las reglas PER_TRADE se registran trade a trade; no tienen sentido aquí.

  const activePerSessionRules = strategy.rules.filter((sr) => sr.rule.scope === 'PER_SESSION')
  const activePerSessionRuleMap = new Map(activePerSessionRules.map((sr) => [sr.id, sr]))

  for (const id of uniqueSessionViolationIds) {
    if (!activePerSessionRuleMap.has(id)) {
      return NextResponse.json(
        {
          error: `La regla '${id}' no existe, no está activa, o no es una regla de sesión`,
        },
        { status: 400 },
      )
    }
  }

  // ── Cálculo del ICO ──────────────────────────────────────────────────────

  const Ts = todaySession.trades.length

  // Contamos los componentes del denominador.
  const C_activas = strategy.conditions.length
  const R_trade   = strategy.rules.filter((sr) => sr.rule.scope === 'PER_TRADE').length
  const R_session = activePerSessionRules.length

  // Rs es el total de "instancias evaluables": cuántas cosas PODRÍA haber
  // hecho bien el trader. Si no hay nada que evaluar, ICO = 1 por convención.
  const Rs = Ts * C_activas + Ts * R_trade + R_session

  // Vs = violaciones de cada trade + violaciones de sesión del body (aún no en BD).
  const tradeLevelViolations = todaySession.trades.reduce(
    (sum, trade) => sum + trade.violations.length,
    0,
  )
  const Vs = tradeLevelViolations + uniqueSessionViolationIds.length

  // Calculamos y normalizamos el ICO:
  // - Math.max/min para clampearlo en [0, 1] por si Vs > Rs (teóricamente
  //   no debería ocurrir con datos correctos, pero clampeamos por seguridad).
  // - Redondeamos a 4 decimales para no acumular errores de punto flotante.
  const icoRaw     = Rs === 0 ? 1.0 : 1 - Vs / Rs
  const icoScoreValue  = Math.round(Math.max(0, Math.min(1, icoRaw)) * 10000) / 10000

  // ── Cierre atómico ───────────────────────────────────────────────────────
  // Usamos una transacción interactiva para que la creación de violaciones
  // de sesión y la actualización del estado sean atómicas: o todo ocurre
  // o nada, evitando sesiones "medio cerradas" con ICO inconsistente.

  const closedSession = await prisma.$transaction(async (tx) => {
    // Creamos las violaciones de sesión mapeando StrategyRule.id → BehavioralRule.id.
    // El mismo patrón que en el trade endpoint: almacenamos el ID del catálogo,
    // no del vínculo intermedio.
    for (const strategyRuleId of uniqueSessionViolationIds) {
      const sr = activePerSessionRuleMap.get(strategyRuleId)!
      await tx.sessionViolation.create({
        data: {
          sessionId: todaySession.id,
          ruleId: sr.ruleId,
        },
      })
    }

    // Actualizamos la sesión con el ICO calculado.
    return tx.session.update({
      where: { id: todaySession.id },
      data: {
        status: 'CLOSED',
        icoScore: icoScoreValue,
        closedAt: new Date(),
      },
    })
  })

  return NextResponse.json(closedSession)
}
