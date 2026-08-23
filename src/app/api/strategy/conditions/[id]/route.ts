import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/strategy/conditions/[id]
//
// Activa o desactiva una condición de entrada de la estrategia del usuario.
// El [id] es el id del StrategyCondition (el vínculo), no el de la condición
// del catálogo. Esto permite que cada usuario tenga su propio toggle independiente.
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

  // Obtenemos el StrategyCondition junto a su Strategy para verificar la autoría.
  // Sin esta comprobación, cualquier usuario autenticado podría modificar la
  // estrategia de otro simplemente conociendo el id del StrategyCondition.
  const strategyCondition = await prisma.strategyCondition.findUnique({
    where: { id },
    include: { strategy: true },
  })

  if (
    !strategyCondition ||
    strategyCondition.strategy.userId !== session.user.id
  ) {
    // Devolvemos 404 en lugar de 403 para no revelar que el recurso existe
    return NextResponse.json({ error: 'Condición no encontrada' }, { status: 404 })
  }

  // Toggle: invertimos el valor actual. El cliente aplica el mismo cambio
  // de forma optimista antes de que llegue esta respuesta.
  const updated = await prisma.strategyCondition.update({
    where: { id },
    data: { isActive: !strategyCondition.isActive },
    include: { condition: true },
  })

  return NextResponse.json(updated)
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/strategy/conditions/[id]
//
// Elimina una condición personalizada de la estrategia del usuario. Las
// condiciones predeterminadas del sistema (isCustom: false) no se pueden
// eliminar, solo desactivar vía PATCH.
//
// Siempre se borra el vínculo StrategyCondition. Si la condición nunca se usó
// en ningún trade (sin TradeViolation que la referencie), también se borra el
// EntryCondition en sí. Si ya tiene historial, el EntryCondition se conserva
// para no romper la integridad referencial de las violaciones ya guardadas
// (mismo criterio de soft delete que el catálogo del sistema).
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

  const strategyCondition = await prisma.strategyCondition.findUnique({
    where: { id },
    include: { strategy: true, condition: true },
  })

  if (
    !strategyCondition ||
    strategyCondition.strategy.userId !== session.user.id
  ) {
    return NextResponse.json({ error: 'Condición no encontrada' }, { status: 404 })
  }

  if (!strategyCondition.condition.isCustom) {
    return NextResponse.json(
      { error: 'Las condiciones predeterminadas del sistema no se pueden eliminar' },
      { status: 403 },
    )
  }

  const violationCount = await prisma.tradeViolation.count({
    where: { conditionId: strategyCondition.conditionId },
  })

  await prisma.$transaction(async (tx) => {
    await tx.strategyCondition.delete({ where: { id } })

    // Sin violaciones históricas que la referencien: se puede borrar del todo.
    // Si las tiene, el EntryCondition se conserva (queda huérfano de estrategia
    // pero intacto para que las violaciones sigan mostrando su label).
    if (violationCount === 0) {
      await tx.entryCondition.delete({ where: { id: strategyCondition.conditionId } })
    }
  })

  return new NextResponse(null, { status: 204 })
}
