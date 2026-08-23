import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/strategy/rules/[id]
//
// Activa o desactiva una regla conductual de la estrategia del usuario.
// El [id] es el id del StrategyRule (el vínculo), no el de la regla del catálogo.
// Mismo patrón de seguridad que el endpoint de condiciones.
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // En Next.js 15+ los params de rutas dinámicas son una Promise
  const { id } = await params

  // Verificamos que el StrategyRule pertenece a la estrategia del usuario.
  // Un usuario no puede activar/desactivar reglas de la estrategia de otro.
  const strategyRule = await prisma.strategyRule.findUnique({
    where: { id },
    include: { strategy: true },
  })

  if (!strategyRule || strategyRule.strategy.userId !== session.user.id) {
    return NextResponse.json({ error: 'Regla no encontrada' }, { status: 404 })
  }

  // Toggle: invertimos el valor actual de isActive
  const updated = await prisma.strategyRule.update({
    where: { id },
    data: { isActive: !strategyRule.isActive },
    include: { rule: true },
  })

  return NextResponse.json(updated)
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/strategy/rules/[id]
//
// Elimina una regla personalizada de la estrategia del usuario. Las reglas
// predeterminadas del sistema (isCustom: false) no se pueden eliminar, solo
// desactivar vía PATCH.
//
// Siempre se borra el vínculo StrategyRule. Si la regla nunca se usó (sin
// TradeViolation ni SessionViolation que la referencien), también se borra
// el BehavioralRule en sí. Si ya tiene historial, se conserva para no romper
// la integridad referencial de las violaciones ya guardadas (mismo criterio
// de soft delete que el catálogo del sistema).
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { id } = await params

  const strategyRule = await prisma.strategyRule.findUnique({
    where: { id },
    include: { strategy: true, rule: true },
  })

  if (!strategyRule || strategyRule.strategy.userId !== session.user.id) {
    return NextResponse.json({ error: 'Regla no encontrada' }, { status: 404 })
  }

  if (!strategyRule.rule.isCustom) {
    return NextResponse.json(
      { error: 'Las reglas predeterminadas del sistema no se pueden eliminar' },
      { status: 403 },
    )
  }

  const [tradeViolationCount, sessionViolationCount] = await Promise.all([
    prisma.tradeViolation.count({ where: { ruleId: strategyRule.ruleId } }),
    prisma.sessionViolation.count({ where: { ruleId: strategyRule.ruleId } }),
  ])

  await prisma.$transaction(async (tx) => {
    await tx.strategyRule.delete({ where: { id } })

    // Sin violaciones históricas que la referencien: se puede borrar del todo.
    // Si las tiene, el BehavioralRule se conserva (queda huérfano de estrategia
    // pero intacto para que las violaciones sigan mostrando su label).
    if (tradeViolationCount === 0 && sessionViolationCount === 0) {
      await tx.behavioralRule.delete({ where: { id: strategyRule.ruleId } })
    }
  })

  return new NextResponse(null, { status: 204 })
}
