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
