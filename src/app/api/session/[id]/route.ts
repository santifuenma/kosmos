import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/session/[id]
// Devuelve una sesión completa con todos sus datos para la página de resultados.
//
// Incluye la estrategia activa del usuario (no la del momento de la sesión,
// ya que el esquema MVP no versiona estrategias). En la práctica el trader
// no cambia su estrategia frecuentemente, así que los datos son representativos.
//
// Seguridad: verificamos que la sesión pertenece al usuario autenticado.
// No devolvemos datos de sesiones de otros traders aunque se conozca el ID.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { id } = await params

  const sessionData = await prisma.session.findUnique({
    where: { id },
    include: {
      trades: {
        include: {
          violations: {
            include: {
              rule: true,
              condition: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      violations: {
        include: { rule: true },
      },
      intention: {
        select: {
          id: true,
          date: true,
          maxTrades: true,
          tradingHoursStart: true,
          tradingHoursEnd: true,
          emotionalState: true,
          notes: true,
          confirmedAt: true,
          strategyId: true,
        },
      },
    },
  })

  if (!sessionData) {
    return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
  }

  // Verificación de propiedad: el trader solo puede ver sus propias sesiones.
  if (sessionData.userId !== session.user.id) {
    return NextResponse.json({ error: 'No tienes permiso' }, { status: 403 })
  }

  // Obtenemos la estrategia con condiciones y reglas activas para el desglose
  // de cumplimiento en la página de resultados.
  const strategy = await prisma.strategy.findUnique({
    where: { id: sessionData.intention.strategyId },
    include: {
      conditions: {
        include: { condition: true },
        orderBy: { condition: { label: 'asc' } },
      },
      rules: {
        include: { rule: true },
        orderBy: { rule: { label: 'asc' } },
      },
    },
  })

  // Incluimos la estrategia en la respuesta para que la página de resultados
  // pueda mostrar el desglose de cumplimiento sin consultas adicionales.
  return NextResponse.json({ ...sessionData, strategy })
}
