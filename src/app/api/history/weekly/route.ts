import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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

// Devuelve el lunes de la semana que contiene la fecha dada (en UTC).
function getMondayUTC(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  // getUTCDay(): 0=domingo, 1=lunes, ..., 6=sábado
  // Si es domingo (0), retrocedemos 6 días; si es lunes (1), 0 días, etc.
  const day = d.getUTCDay()
  const daysToMonday = day === 0 ? 6 : day - 1
  d.setUTCDate(d.getUTCDate() - daysToMonday)
  return d
}

// Desviación estándar poblacional (no muestral).
// Usamos la poblacional porque tenemos el conjunto completo de sesiones
// de la semana, no una muestra de una población mayor.
function stdDevPopulation(values: number[]): number {
  if (values.length <= 1) return 0 // Con 0 o 1 valor la variabilidad es 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

// Número de semana ISO del año para el label "Sem 14".
// La semana ISO 1 es la que contiene el primer jueves del año.
function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7  // convertir domingo (0) a 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)  // mover al jueves de esa semana
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

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

    let icoWeekly: number | null   = null
    let avgDailyIco: number | null = null
    let stability: number | null   = null

    if (icoValues.length > 0) {
      const M  = icoValues.reduce((a, b) => a + b, 0) / icoValues.length
      const sd = stdDevPopulation(icoValues)

      // E normaliza la desviación estándar al rango [0,1].
      // Con sd=0 (todos iguales), E=1. Con sd=0.5 (máxima teórica), E=0.
      const E = Math.max(0, Math.min(1, 1 - sd / 0.5))

      icoWeekly   = Math.round((0.7 * M + 0.3 * E) * 10000) / 10000
      avgDailyIco = Math.round(M * 10000) / 10000
      stability   = Math.round(E * 10000) / 10000
    }

    // Formateamos las fechas como "YYYY-MM-DD" para serialización estable.
    const fmt = (d: Date) => d.toISOString().split('T')[0]

    result.push({
      weekStart:    fmt(monday),
      weekEnd:      fmt(sunday),
      weekLabel:    `Sem ${getISOWeekNumber(monday)}`,
      icoWeekly,
      sessionCount: icoValues.length,
      avgDailyIco,
      stability,
      dailyIcos:    icoValues,
    })
  }

  return NextResponse.json({ weeks: result })
}
