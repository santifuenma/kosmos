import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/strategy/rules
//
// Crea una regla conductual personalizada para el usuario autenticado y la
// vincula (activa) a su estrategia. Igual que las condiciones personalizadas,
// es privada: solo aparece en la estrategia de quien la creó (isCustom/userId
// en el schema; excluida del catálogo global en GET /api/catalog y
// POST /api/strategy).
//
// El modal de creación deja elegir el scope (PER_TRADE / PER_SESSION) para
// que la regla aparezca en la lista "Por Operación" o "Por Sesión" correcta;
// si no se envía, por defecto es PER_TRADE (el caso más habitual).
// ─────────────────────────────────────────────────────────────────────────────
const VALID_SCOPES = ['PER_TRADE', 'PER_SESSION']

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

  const { label, description, scope = 'PER_TRADE' } = await request.json()

  if (!label?.trim()) {
    return NextResponse.json({ error: 'El título de la regla es obligatorio' }, { status: 400 })
  }
  if (!description?.trim()) {
    return NextResponse.json({ error: 'La descripción de la regla es obligatoria' }, { status: 400 })
  }
  if (!VALID_SCOPES.includes(scope)) {
    return NextResponse.json({ error: 'El alcance de la regla no es válido' }, { status: 400 })
  }

  // El código solo se usa como identificador interno estable; para reglas
  // personalizadas no hace referencia a ningún código de la app, así que basta
  // con que sea único (a diferencia del catálogo del sistema, ej: "MAINTAIN_SL").
  const code = `CUSTOM_${randomBytes(8).toString('hex')}`

  // Creamos la regla y su vínculo con la estrategia en una transacción:
  // si el vínculo fallara, no queremos dejar una regla huérfana.
  const strategyRule = await prisma.$transaction(async (tx) => {
    const rule = await tx.behavioralRule.create({
      data: {
        code,
        label: label.trim(),
        description: description.trim(),
        scope,
        isCustom: true,
        userId: session.user.id,
      },
    })

    return tx.strategyRule.create({
      data: {
        strategyId: strategy.id,
        ruleId: rule.id,
        isActive: true,
      },
      include: { rule: true },
    })
  })

  return NextResponse.json(strategyRule, { status: 201 })
}
