import { NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/catalog
// Devuelve el catálogo maestro completo: condiciones de entrada y reglas
// conductuales que el sistema ofrece a todos los traders.
//
// Existe para el onboarding: el usuario elige qué reglas y condiciones activar
// ANTES de que su estrategia exista en BD, así que no puede leerlas desde
// GET /api/strategy (que devolvería 404). Con este endpoint el flujo recoge
// todas las decisiones y las envía en un único POST /api/strategy.
//
// Ordenamos por label para que la lista coincida con el orden que usa la
// página de estrategia y el usuario no vea los ítems saltando de sitio.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const [conditions, rules] = await Promise.all([
    prisma.entryCondition.findMany({ orderBy: { label: 'asc' } }),
    prisma.behavioralRule.findMany({ orderBy: { label: 'asc' } }),
  ])

  return NextResponse.json({ conditions, rules })
}
