import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ─────────────────────────────────────────────────────────────────────────────
// Parámetros de include reutilizados en las tres operaciones.
//
// Siempre devolvemos la estrategia con sus condiciones y reglas expandidas
// para que el cliente no tenga que hacer llamadas adicionales. Ordenamos
// por label para que la lista sea predecible y no cambie entre renders.
// ─────────────────────────────────────────────────────────────────────────────
const strategyInclude = {
  conditions: {
    include: { condition: true },
    orderBy: { condition: { label: 'asc' as const } },
  },
  rules: {
    include: { rule: true },
    orderBy: { rule: { label: 'asc' as const } },
  },
}

// Regex para validar el formato "HH:mm" de las horas de trading.
// Acepta 00:00 – 23:59 con cero inicial obligatorio.
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

// Convierte una hora "HH:mm" a minutos desde medianoche para comparar rangos.
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/strategy
// Devuelve la estrategia del usuario autenticado con todas sus relaciones.
// Responde 404 si el usuario aún no ha configurado su estrategia.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // Buscamos la estrategia del usuario autenticado.
  // En el MVP cada usuario tiene como máximo una estrategia (@unique userId).
  const strategy = await prisma.strategy.findUnique({
    where: { userId: session.user.id },
    include: strategyInclude,
  })

  if (!strategy) {
    return NextResponse.json(
      { error: 'El usuario no tiene estrategia configurada' },
      { status: 404 },
    )
  }

  return NextResponse.json(strategy)
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/strategy
// Crea la estrategia del usuario y la vincula automáticamente con TODO el
// catálogo (condiciones y reglas) en estado inactivo.
//
// Los límites operativos son opcionales en la creación: si no se envían se
// usan los defaults del schema (3 trades, 09:00–11:30). Esto permite crear
// una estrategia rápidamente y ajustar los límites después.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // Verificamos antes del insert para devolver un error claro.
  // Aunque @unique en userId lo impediría igualmente, el mensaje de Prisma
  // sería genérico y confundente para el cliente.
  const existing = await prisma.strategy.findUnique({
    where: { userId: session.user.id },
  })
  if (existing) {
    return NextResponse.json(
      { error: 'Ya tienes una estrategia. Solo se permite una por usuario.' },
      { status: 409 },
    )
  }

  const { name, description, maxTrades, tradingHoursStart, tradingHoursEnd } =
    await request.json()

  if (!name?.trim()) {
    return NextResponse.json(
      { error: 'El nombre de la estrategia es obligatorio' },
      { status: 400 },
    )
  }

  // Validamos los límites operativos solo si el cliente los envía explícitamente.
  // Si no vienen, Prisma aplicará los valores @default del schema.
  if (maxTrades !== undefined && (!Number.isInteger(maxTrades) || maxTrades < 1)) {
    return NextResponse.json(
      { error: 'El máximo de operaciones debe ser un número entero mayor que 0' },
      { status: 400 },
    )
  }
  if (tradingHoursStart !== undefined && !TIME_REGEX.test(tradingHoursStart)) {
    return NextResponse.json(
      { error: 'El horario de inicio debe tener formato HH:mm' },
      { status: 400 },
    )
  }
  if (tradingHoursEnd !== undefined && !TIME_REGEX.test(tradingHoursEnd)) {
    return NextResponse.json(
      { error: 'El horario de fin debe tener formato HH:mm' },
      { status: 400 },
    )
  }
  if (
    tradingHoursStart !== undefined &&
    tradingHoursEnd !== undefined &&
    timeToMinutes(tradingHoursStart) >= timeToMinutes(tradingHoursEnd)
  ) {
    return NextResponse.json(
      { error: 'El horario de inicio debe ser anterior al de fin' },
      { status: 400 },
    )
  }

  // Obtenemos el catálogo completo antes de la transacción de creación.
  // Usamos Promise.all para hacer las dos queries en paralelo y reducir latencia.
  const [allConditions, allRules] = await Promise.all([
    prisma.entryCondition.findMany(),
    prisma.behavioralRule.findMany(),
  ])

  const strategy = await prisma.strategy.create({
    data: {
      userId: session.user.id,
      name: name.trim(),
      description: description?.trim() || null,
      // Solo incluimos los límites si el cliente los envió; de lo contrario
      // Prisma usa los @default del schema y el código queda limpio.
      ...(maxTrades !== undefined && { maxTrades }),
      ...(tradingHoursStart !== undefined && { tradingHoursStart }),
      ...(tradingHoursEnd !== undefined && { tradingHoursEnd }),
      // Creamos los vínculos con el catálogo dentro del mismo create de Prisma
      // para que sea atómico: si falla algún vínculo, no se crea la estrategia.
      conditions: {
        create: allConditions.map((c) => ({
          conditionId: c.id,
          isActive: false,
        })),
      },
      rules: {
        create: allRules.map((r) => ({
          ruleId: r.id,
          isActive: false,
        })),
      },
    },
    include: strategyInclude,
  })

  return NextResponse.json(strategy, { status: 201 })
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/strategy
// Actualiza la configuración de la estrategia: nombre, descripción y límites
// operativos. Solo se actualizan los campos que vengan en el body.
// ─────────────────────────────────────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const body = await request.json()
  const { name, description, maxTrades, tradingHoursStart, tradingHoursEnd } = body

  // Construimos el objeto de actualización dinámicamente con solo los campos
  // recibidos, para que el cliente pueda enviar un subconjunto sin pisar los demás.
  // Prisma acepta un tipo mixto (string | number | null) en el objeto de datos.
  const data: Record<string, string | number | null> = {}

  if (name !== undefined) data.name = name.trim()
  if (description !== undefined) data.description = description?.trim() || null
  if (maxTrades !== undefined) data.maxTrades = maxTrades
  if (tradingHoursStart !== undefined) data.tradingHoursStart = tradingHoursStart
  if (tradingHoursEnd !== undefined) data.tradingHoursEnd = tradingHoursEnd

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No hay campos para actualizar' }, { status: 400 })
  }

  // Validaciones de los campos recibidos
  if (data.name === '') {
    return NextResponse.json({ error: 'El nombre no puede estar vacío' }, { status: 400 })
  }
  if (
    maxTrades !== undefined &&
    (!Number.isInteger(maxTrades) || maxTrades < 1)
  ) {
    return NextResponse.json(
      { error: 'El máximo de operaciones debe ser un número entero mayor que 0' },
      { status: 400 },
    )
  }
  if (tradingHoursStart !== undefined && !TIME_REGEX.test(tradingHoursStart)) {
    return NextResponse.json(
      { error: 'El horario de inicio debe tener formato HH:mm' },
      { status: 400 },
    )
  }
  if (tradingHoursEnd !== undefined && !TIME_REGEX.test(tradingHoursEnd)) {
    return NextResponse.json(
      { error: 'El horario de fin debe tener formato HH:mm' },
      { status: 400 },
    )
  }

  // Validamos el orden de horas cuando vienen ambas en la misma petición,
  // o cuando una viene y la otra ya está en BD. Para el segundo caso,
  // necesitaríamos leer la estrategia primero; por ahora validamos solo
  // cuando ambas se envían juntas (el cliente envía siempre las dos).
  if (tradingHoursStart !== undefined && tradingHoursEnd !== undefined) {
    if (timeToMinutes(tradingHoursStart) >= timeToMinutes(tradingHoursEnd)) {
      return NextResponse.json(
        { error: 'El horario de inicio debe ser anterior al de fin' },
        { status: 400 },
      )
    }
  }

  // updateMany con userId en el where nos evita una query de lookup previa.
  // Si el usuario no tiene estrategia, count es 0 y respondemos 404.
  const result = await prisma.strategy.updateMany({
    where: { userId: session.user.id },
    data,
  })

  if (result.count === 0) {
    return NextResponse.json(
      { error: 'No tienes ninguna estrategia que actualizar' },
      { status: 404 },
    )
  }

  const updated = await prisma.strategy.findUnique({
    where: { userId: session.user.id },
    include: strategyInclude,
  })

  return NextResponse.json(updated)
}
