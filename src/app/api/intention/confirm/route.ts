import { NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/intention/confirm
// Confirma la intención del día actual y abre la sesión de trading.
//
// Este endpoint implementa la barrera de reflexión previa: el trader no puede
// operar hasta que confirme explícitamente que ha revisado su plan del día.
// El flujo es:
//   1. POST /api/intention  → crea la intención (confirmedAt = null)
//   2. POST /api/intention/confirm → (a) pone confirmedAt = now()
//                                    (b) crea la Session en estado OPEN
//
// Se crea una Session atomicamente con la confirmación: si falla cualquiera
// de las dos operaciones, no quedan datos inconsistentes en BD.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // Helpers de rango de fecha (mismo criterio que en /api/intention)
  const now = new Date()
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const startOfTomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))

  // Buscamos la intención de hoy con su sesión ya incluida.
  // Necesitamos session para saber si ya existe (evitar crear duplicado).
  const intention = await prisma.dailyIntention.findFirst({
    where: {
      userId: session.user.id,
      date: {
        gte: startOfToday,
        lt: startOfTomorrow,
      },
    },
    include: {
      session: {
        select: {
          id: true,
          status: true,
          icoScore: true,
          createdAt: true,
          closedAt: true,
        },
      },
    },
  })

  if (!intention) {
    return NextResponse.json(
      { error: 'No existe intención para hoy. Crea una antes de confirmar.' },
      { status: 404 },
    )
  }

  // Idempotencia: si ya está confirmada, no hacemos nada y devolvemos la intención tal cual.
  // Esto permite que el cliente llame al endpoint de nuevo sin romper nada si hay un retry.
  if (intention.confirmedAt !== null) {
    return NextResponse.json(intention)
  }

  // Usamos una transacción para que la confirmación y la creación de sesión
  // sean atómicas: o las dos operaciones ocurren, o ninguna.
  const confirmTimestamp = new Date()

  const [updatedIntention] = await prisma.$transaction([
    // 1. Marcar la intención como confirmada
    prisma.dailyIntention.update({
      where: { id: intention.id },
      data: { confirmedAt: confirmTimestamp },
      include: {
        session: {
          select: {
            id: true,
            status: true,
            icoScore: true,
            createdAt: true,
            closedAt: true,
          },
        },
      },
    }),
    // 2. Crear la sesión de trading vinculada a esta intención
    prisma.session.create({
      data: {
        userId: session.user.id,
        intentionId: intention.id,
        date: startOfToday,
        status: 'OPEN',
      },
    }),
  ])

  return NextResponse.json(updatedIntention, { status: 201 })
}
