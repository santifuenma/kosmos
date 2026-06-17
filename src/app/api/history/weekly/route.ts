import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getISOWeekNumber, getMondayUTC } from '@/lib/dates'
import { computeWeeklyIco } from '@/lib/ico'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/history/weekly
// Calcula el ICO semanal para las últimas N semanas.
//
// El ICO semanal combina dos factores para medir no solo el promedio de
// disciplina sino también la consistencia:
//
//   M  = media de los ICO diarios de la semana
//   σ  = desviación estándar poblacional de los ICO diarios
//   E  = max(0, min(1, 1 - σ/0.5))  ← estabilidad conductual
//   ICO_week = 0.70 × M + 0.30 × E
//
// El factor 0.5 normaliza la desviación: es la desviación máxima teórica
// cuando los valores están en [0,1] (variance máxima de una distribución
// Bernoulli). Así E = 1 cuando todos los ICOs son iguales, y E = 0 cuando
// la variabilidad es máxima. Esto premia la consistencia sobre el desempeño
// puntual aislado.
//
// Las semanas se calculan de lunes a domingo en UTC para ser independientes
// del huso horario del cliente.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const weeks = Math.min(52, Math.max(1, parseInt(searchParams.get('weeks') ?? '8', 10) || 8))

  // Calculamos el lunes de la semana actual como punto de partida.
  const currentMonday = getMondayUTC(new Date())

  // Recuperamos todas las sesiones cerradas de las últimas N semanas en una
  // sola query, para luego agruparlas en memoria por semana.
  // Esto es más eficiente que hacer N queries independientes.
  const rangeStart = new Date(currentMonday)
  rangeStart.setUTCDate(rangeStart.getUTCDate() - (weeks - 1) * 7)

  const allSessions = await prisma.session.findMany({
    where: {
      userId: session.user.id,
      status: 'CLOSED',
      date: { gte: rangeStart },
      icoScore: { not: null },
    },
    select: { date: true, icoScore: true },
    orderBy: { date: 'asc' },
  })

  // Generamos la lista de semanas de atrás hacia adelante.
  // Para cada semana calculamos sus métricas con las sesiones que caen en ella.
  const result = []

  for (let i = weeks - 1; i >= 0; i--) {
    const monday = new Date(currentMonday)
    monday.setUTCDate(monday.getUTCDate() - i * 7)

    const sunday = new Date(monday)
    sunday.setUTCDate(sunday.getUTCDate() + 6)

    // Fin del domingo: 23:59:59.999 UTC para incluir todas las sesiones del día.
    const sundayEnd = new Date(sunday)
    sundayEnd.setUTCHours(23, 59, 59, 999)

    // Filtramos las sesiones que caen dentro de esta semana concreta.
    const weekSessions = allSessions.filter((s) => {
      const d = new Date(s.date)
      return d >= monday && d <= sundayEnd
    })

    const icoValues = weekSessions
      .map((s) => s.icoScore)
      .filter((v): v is number => v !== null)

    // La fórmula vive en `lib/ico.ts`. Devuelve null cuando no hay sesiones,
    // de modo que aquí solo destructuramos los campos cuando hay datos.
    const weekly = computeWeeklyIco(icoValues)

    // Formateamos las fechas como "YYYY-MM-DD" para serialización estable.
    const fmt = (d: Date) => d.toISOString().split('T')[0]

    result.push({
      weekStart:    fmt(monday),
      weekEnd:      fmt(sunday),
      weekLabel:    `Sem ${getISOWeekNumber(monday)}`,
      icoWeekly:    weekly?.icoWeekly   ?? null,
      sessionCount: icoValues.length,
      avgDailyIco:  weekly?.avgDailyIco ?? null,
      stability:    weekly?.stability   ?? null,
      dailyIcos:    icoValues,
    })
  }

  return NextResponse.json({ weeks: result })
}
