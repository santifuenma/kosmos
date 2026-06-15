import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/history
// Devuelve las sesiones cerradas del usuario con paginación.
//
// Devolvemos una versión compacta de cada sesión (sin el detalle de trades
// individuales) para que la lista sea rápida de cargar. El detalle completo
// se obtiene navegando a /session/[id].
//
// Los conteos de trades y violaciones se calculan aquí para que el cliente
// pueda mostrar los indicadores visuales sin queries adicionales.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1',  10) || 1)
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10) || 20))
  const skip  = (page - 1) * limit

  // Ejecutamos count y datos en paralelo para evitar dos round-trips secuenciales.
  const [total, sessions] = await Promise.all([
    prisma.session.count({
      where: { userId: session.user.id, status: 'CLOSED' },
    }),
    prisma.session.findMany({
      where: { userId: session.user.id, status: 'CLOSED' },
      orderBy: { date: 'desc' },
      skip,
      take: limit,
      include: {
        // Necesitamos el estado emocional para los indicadores de la lista.
        intention: {
          select: { emotionalState: true },
        },
        // Incluimos las violaciones de trades para poder sumarlas.
        // No incluimos el detalle de cada trade para mantener el payload pequeño.
        trades: {
          select: {
            pnlAmount: true,
            violations: { select: { id: true } },
          },
        },
        // Violaciones de sesión (PER_SESSION).
        violations: { select: { id: true } },
      },
    }),
  ])

  // Transformamos el resultado en el formato compacto SessionHistoryItem.
  // El cálculo de P&L neto suma todos los trades con importe registrado;
  // si ningún trade tiene P&L, devolvemos null en lugar de 0 para distinguir
  // "sin datos financieros" de "resultado neutro".
  const items = sessions.map((s) => {
    const tradeViolations   = s.trades.reduce((sum, t) => sum + t.violations.length, 0)
    const sessionViolations = s.violations.length
    const pnlValues         = s.trades.map((t) => t.pnlAmount).filter((v): v is number => v !== null)

    return {
      id:             s.id,
      date:           s.date,
      closedAt:       s.closedAt,
      icoScore:       s.icoScore,
      tradeCount:     s.trades.length,
      violationCount: tradeViolations + sessionViolations,
      emotionalState: s.intention.emotionalState,
      pnlTotal:       pnlValues.length > 0 ? pnlValues.reduce((a, b) => a + b, 0) : null,
    }
  })

  return NextResponse.json({
    sessions:   items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  })
}
