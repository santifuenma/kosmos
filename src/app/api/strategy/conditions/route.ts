import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { TEXT_LIMITS, readJsonBody, requiredText } from '@/lib/validation'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/strategy/conditions
//
// Crea una condición de entrada personalizada para el usuario autenticado y
// la vincula (activa) a su estrategia. A diferencia del catálogo del sistema,
// una condición personalizada es privada: solo aparece en la estrategia de
// quien la creó (ver isCustom/userId en el schema y los filtros de
// GET /api/catalog y POST /api/strategy, que la excluyen del catálogo global).
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const strategy = await prisma.strategy.findUnique({
    where: { userId: session.user.id },
  })
  if (!strategy) {
    return NextResponse.json(
      { error: 'El usuario no tiene estrategia configurada' },
      { status: 404 },
    )
  }

  const body = await readJsonBody(request)
  if (!body) {
    return NextResponse.json({ error: 'El cuerpo de la petición no es JSON válido' }, { status: 400 })
  }

  const label = requiredText(body.label, 'El título de la condición', TEXT_LIMITS.label)
  if (!label.ok) {
    return NextResponse.json({ error: label.error }, { status: 400 })
  }

  const description = requiredText(body.description, 'La descripción de la condición', TEXT_LIMITS.description)
  if (!description.ok) {
    return NextResponse.json({ error: description.error }, { status: 400 })
  }

  // El código solo se usa como identificador interno estable; para condiciones
  // personalizadas no hace referencia a ningún código de la app, así que basta
  // con que sea único (a diferencia del catálogo del sistema, ej: "TREND_CONFIRM").
  const code = `CUSTOM_${randomBytes(8).toString('hex')}`

  // Creamos la condición y su vínculo con la estrategia en una transacción:
  // si el vínculo fallara, no queremos dejar una condición huérfana.
  const strategyCondition = await prisma.$transaction(async (tx) => {
    const condition = await tx.entryCondition.create({
      data: {
        code,
        label: label.value,
        description: description.value,
        isCustom: true,
        userId: session.user.id,
      },
    })

    return tx.strategyCondition.create({
      data: {
        strategyId: strategy.id,
        conditionId: condition.id,
        isActive: true,
      },
      include: { condition: true },
    })
  })

  return NextResponse.json(strategyCondition, { status: 201 })
}
