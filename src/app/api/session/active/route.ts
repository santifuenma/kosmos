import { NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/session/active
// Devuelve la sesión de trading abierta del día actual para el usuario.
//
// Devuelve 404 si no hay sesión abierta hoy, lo que permite que la página
// de sesión activa redirija a /session/new sin necesidad de lógica adicional.
//
// La respuesta incluye todo lo que la página de sesión activa necesita:
//   - Los trades con sus violaciones expandidas (para la lista de operaciones)
//   - Las violaciones de sesión (para el estado actual de reglas PER_SESSION)
//   - La intención diaria (para horario, maxTrades y estado emocional)
// ─────────────────────────────────────────────────────────────────────────────

function getStartOfToday(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function getStartOfTomorrow(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

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
        include: {
          violations: {
            include: {
              // Expandimos tanto regla como condición para que el cliente
              // pueda mostrar el label de lo que se violó sin queries adicionales.
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
      // Incluimos la intención para mostrar el estado emocional y los límites operativos.
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
        },
      },
    },
  })

  if (!todaySession) {
    return NextResponse.json(
      { error: 'No hay sesión abierta hoy' },
      { status: 404 },
    )
  }

  // Última sesión cerrada (para mostrar "Última sesión: Ayer, 24 de mayo…")
  const previousSession = await prisma.session.findFirst({
    where: {
      userId: session.user.id,
      status: 'CLOSED',
    },
    orderBy: { date: 'desc' },
    select: { date: true },
  })

  return NextResponse.json({
    ...todaySession,
    previousSessionDate: previousSession?.date ?? null,
  })
}
