import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de fecha
//
// Todas las intenciones se almacenan con fecha normalizada a medianoche UTC.
// Esto garantiza que @@unique([userId, date]) funcione correctamente: dos
// llamadas al POST en el mismo día producen la misma fecha y fallan con 409.
// ─────────────────────────────────────────────────────────────────────────────

// Devuelve el inicio del día actual en UTC (ej: 2026-04-03T00:00:00.000Z).
// Se usa tanto para crear como para buscar la intención del día.
function getStartOfToday(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

// Devuelve el inicio del día siguiente en UTC, para el filtro de rango en GET.
function getStartOfTomorrow(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
}

// Valores válidos del enum EmotionalState definidos en el schema.
// Los validamos aquí para dar un error claro antes de llegar a Prisma.
const VALID_EMOTIONAL_STATES = ['NEUTRAL', 'ANXIOUS', 'CONFIDENT', 'FRUSTRATED', 'TIRED'] as const
type EmotionalState = (typeof VALID_EMOTIONAL_STATES)[number]

function isValidEmotionalState(value: unknown): value is EmotionalState {
  return VALID_EMOTIONAL_STATES.includes(value as EmotionalState)
}

// Parámetros de include reutilizados en GET y POST.
// Incluimos la sesión asociada (si existe) para que el cliente pueda saber
// en un solo fetch si ya hay sesión abierta y redirigir correctamente.
const intentionInclude = {
  session: {
    select: {
      id: true,
      status: true,
      icoScore: true,
      createdAt: true,
      closedAt: true,
    },
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/intention
// Devuelve la intención del día actual para el usuario autenticado.
// Responde 404 si aún no ha creado ninguna intención hoy.
// Incluye la sesión asociada (puede ser null si no la ha abierto todavía).
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // Buscamos la intención cuya fecha caiga dentro del día de hoy (UTC).
  // Usamos un rango [hoy, mañana) en lugar de igualdad exacta para absorber
  // posibles diferencias de milisegundos si en el futuro se cambia la normalización.
  const intention = await prisma.dailyIntention.findFirst({
    where: {
      userId: session.user.id,
      date: {
        gte: getStartOfToday(),
        lt: getStartOfTomorrow(),
      },
    },
    include: intentionInclude,
  })

  if (!intention) {
    return NextResponse.json(
      { error: 'No existe intención para el día de hoy' },
      { status: 404 },
    )
  }

  return NextResponse.json(intention)
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/intention
// Crea la intención diaria del usuario para hoy.
//
// Los límites operativos (maxTrades, tradingHours) se copian automáticamente
// de la estrategia: el trader los fijó allí precisamente para no poder
// cambiarlos por impulso cada día. El cliente no los envía en el body.
//
// El campo confirmedAt se deja en null: la intención creada está pendiente de
// confirmación. Hasta que el trader pulse "Confirmar" (POST /api/intention/confirm)
// no se puede abrir sesión.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // Verificamos que el usuario tiene estrategia configurada.
  // Sin estrategia no hay límites que copiar ni catálogo de condiciones/reglas.
  const strategy = await prisma.strategy.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      maxTrades: true,
      tradingHoursStart: true,
      tradingHoursEnd: true,
    },
  })
  if (!strategy) {
    return NextResponse.json(
      { error: 'Debes configurar tu estrategia antes de crear una intención diaria' },
      { status: 409 },
    )
  }

  // Comprobamos si ya existe intención para hoy antes del insert,
  // para dar un mensaje de error claro en lugar del genérico de constraint única.
  const existing = await prisma.dailyIntention.findFirst({
    where: {
      userId: session.user.id,
      date: {
        gte: getStartOfToday(),
        lt: getStartOfTomorrow(),
      },
    },
  })
  if (existing) {
    return NextResponse.json(
      { error: 'Ya has creado una intención para hoy' },
      { status: 409 },
    )
  }

  const { emotionalState, notes } = await request.json()

  if (!isValidEmotionalState(emotionalState)) {
    return NextResponse.json(
      {
        error: `El estado emocional debe ser uno de: ${VALID_EMOTIONAL_STATES.join(', ')}`,
      },
      { status: 400 },
    )
  }

  const intention = await prisma.dailyIntention.create({
    data: {
      userId: session.user.id,
      strategyId: strategy.id,
      date: getStartOfToday(),
      // Copiamos los límites de la estrategia para que queden como snapshot del día.
      // Si el trader modifica la estrategia después, las intenciones anteriores
      // conservan los valores con los que realmente operaron.
      maxTrades: strategy.maxTrades,
      tradingHoursStart: strategy.tradingHoursStart,
      tradingHoursEnd: strategy.tradingHoursEnd,
      emotionalState,
      notes: notes?.trim() || null,
      // confirmedAt queda null hasta que el trader confirme explícitamente.
    },
    include: intentionInclude,
  })

  return NextResponse.json(intention, { status: 201 })
}
