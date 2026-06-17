import { NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getMondayUTC } from '@/lib/dates'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/history/feedback
// Genera retroalimentación conductual basada en los datos de la semana reciente.
//
// El feedback no es genérico: se construye con los números reales del trader.
// Los mensajes tienen tipos (positive / neutral / warning / info) para que
// el cliente pueda renderizarlos con colores e iconos diferenciados.
//
// Algoritmo:
//   1. Identificar la semana con datos más reciente (actual o anterior)
//   2. Comparar con la semana previa si existe
//   3. Detectar la regla/condición más violada
//   4. Detectar si hay patrón recurrente (misma regla en ≥3 sesiones)
//   5. Detectar correlación emocional negativa (requiere ≥3 sesiones)
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const currentMonday = getMondayUTC(new Date())

  // Buscamos las sesiones de las últimas 2 semanas con el detalle necesario
  // para todos los análisis: violaciones con sus labels, estado emocional e ICO.
  const twoWeeksAgo = new Date(currentMonday)
  twoWeeksAgo.setUTCDate(twoWeeksAgo.getUTCDate() - 7)

  const recentSessions = await prisma.session.findMany({
    where: {
      userId: session.user.id,
      status: 'CLOSED',
      date: { gte: twoWeeksAgo },
      icoScore: { not: null },
    },
    orderBy: { date: 'asc' },
    include: {
      intention: { select: { emotionalState: true } },
      trades: {
        include: {
          violations: {
            include: { rule: true, condition: true },
          },
        },
      },
      violations: {
        include: { rule: true },
      },
    },
  })

  if (recentSessions.length === 0) {
    return NextResponse.json({
      messages: [],
      weekAnalyzed: 'Sin datos',
    })
  }

  // Separamos las sesiones por semana (actual vs anterior).
  const currentWeekEnd = new Date(currentMonday)
  currentWeekEnd.setUTCDate(currentWeekEnd.getUTCDate() + 6)
  currentWeekEnd.setUTCHours(23, 59, 59, 999)

  const currentWeekSessions = recentSessions.filter((s) => new Date(s.date) >= currentMonday)
  const prevWeekSessions     = recentSessions.filter((s) => new Date(s.date) < currentMonday)

  // Usamos la semana actual si tiene datos; si no, la semana anterior.
  // Esto evita mostrar una pantalla vacía el lunes porque la semana actual
  // todavía no tiene sesiones.
  const analyzedSessions = currentWeekSessions.length > 0 ? currentWeekSessions : prevWeekSessions
  const weekAnalyzed = currentWeekSessions.length > 0
    ? `Semana actual (${currentMonday.toISOString().split('T')[0]})`
    : `Semana anterior`

  const messages: { type: string; text: string }[] = []

  // ── 1. Comparación con semana anterior ──────────────────────────────────
  if (currentWeekSessions.length > 0 && prevWeekSessions.length > 0) {
    const avgCurrent = currentWeekSessions.reduce((sum, s) => sum + (s.icoScore ?? 0), 0) / currentWeekSessions.length
    const avgPrev    = prevWeekSessions.reduce((sum, s) => sum + (s.icoScore ?? 0), 0) / prevWeekSessions.length

    const diff        = avgCurrent - avgPrev
    const diffPercent = Math.round(Math.abs(diff) * 100)
    const currentPct  = Math.round(avgCurrent * 100)
    const prevPct     = Math.round(avgPrev * 100)

    if (Math.abs(diff) < 0.03) {
      // Diferencia insignificante (< 3 puntos): estabilidad
      messages.push({
        type: 'neutral',
        text: `Tu ICO semanal se mantiene estable en torno al ${currentPct}% (semana anterior: ${prevPct}%).`,
      })
    } else if (diff > 0) {
      messages.push({
        type: 'positive',
        text: `Tu ICO semanal pasó de ${prevPct}% a ${currentPct}% (+${diffPercent}%). ¡Estás mejorando tu disciplina!`,
      })
    } else {
      messages.push({
        type: 'neutral',
        text: `Tu ICO semanal pasó de ${prevPct}% a ${currentPct}% (−${diffPercent}%). Analiza qué cambió esta semana.`,
      })
    }
  }

  // ── 2. Regla/condición más violada de la semana analizada ───────────────
  // Agregamos todas las violaciones para encontrar el patrón más frecuente.
  const violationCounts = new Map<string, { label: string; count: number; sessionIds: Set<string> }>()

  for (const s of analyzedSessions) {
    // Violaciones de trades (PER_TRADE y condiciones)
    for (const trade of s.trades) {
      for (const v of trade.violations) {
        const key   = v.ruleId ?? v.conditionId ?? 'unknown'
        const label = v.rule?.label ?? v.condition?.label ?? 'Desconocido'
        const entry = violationCounts.get(key) ?? { label, count: 0, sessionIds: new Set() }
        entry.count++
        entry.sessionIds.add(s.id)
        violationCounts.set(key, entry)
      }
    }
    // Violaciones de sesión (PER_SESSION)
    for (const v of s.violations) {
      const key   = v.ruleId
      const label = v.rule?.label ?? 'Regla de sesión'
      const entry = violationCounts.get(key) ?? { label, count: 0, sessionIds: new Set() }
      entry.count++
      entry.sessionIds.add(s.id)
      violationCounts.set(key, entry)
    }
  }

  // Ordenamos por frecuencia descendente para identificar la más problemática.
  const sortedViolations = [...violationCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)

  if (sortedViolations.length > 0) {
    const [, { label: worstLabel, count: worstCount, sessionIds: worstSessions }] = sortedViolations[0]
    const sessionCountForWorst = worstSessions.size

    messages.push({
      type: worstCount >= 3 ? 'warning' : 'info',
      text: `La regla que más te costó cumplir esta semana fue "${worstLabel}" ` +
            `(${worstCount} ${worstCount === 1 ? 'vez' : 'veces'} en ${sessionCountForWorst} ` +
            `${sessionCountForWorst === 1 ? 'sesión' : 'sesiones'}).`,
    })

    // ── 3. Patrón recurrente (misma regla en ≥3 sesiones diferentes) ──────
    if (sessionCountForWorst >= 3) {
      messages.push({
        type: 'warning',
        text: `Has tenido dificultades con "${worstLabel}" en múltiples sesiones. ` +
              `Considera si esta regla necesita atención especial o si tu estrategia necesita ajuste.`,
      })
    }
  } else if (analyzedSessions.length > 0) {
    // Sin violaciones en la semana analizada
    messages.push({
      type: 'positive',
      text: 'Esta semana no has cometido ninguna violación registrada. ¡Excelente disciplina!',
    })
  }

  // ── 4. Correlación emocional ────────────────────────────────────────────
  // Necesitamos ≥3 sesiones para que la correlación tenga sentido estadístico.
  // Con menos datos el resultado sería muy ruidoso y podría ser engañoso.
  if (analyzedSessions.length >= 3) {
    // Agrupamos ICOs por estado emocional para calcular la media de cada uno.
    const icoByEmotion = new Map<string, number[]>()
    for (const s of analyzedSessions) {
      const state = s.intention.emotionalState
      const arr   = icoByEmotion.get(state) ?? []
      arr.push(s.icoScore ?? 0)
      icoByEmotion.set(state, arr)
    }

    // Calculamos la media global para comparar con cada estado individual.
    const globalAvg = analyzedSessions.reduce((sum, s) => sum + (s.icoScore ?? 0), 0) / analyzedSessions.length

    // Umbral: consideramos significativa una diferencia de >10 puntos porcentuales.
    const EMOTIONAL_THRESHOLD = 0.10

    for (const [state, icos] of icoByEmotion.entries()) {
      // Exigimos al menos 2 sesiones con el mismo estado para evitar falsos positivos.
      if (icos.length < 2) continue
      const avg = icos.reduce((a, b) => a + b, 0) / icos.length
      if (globalAvg - avg > EMOTIONAL_THRESHOLD) {
        const stateLabels: Record<string, string> = {
          NEUTRAL:    'neutro/a',
          ANXIOUS:    'ansioso/a',
          CONFIDENT:  'confiado/a',
          FRUSTRATED: 'frustrado/a',
          TIRED:      'cansado/a',
        }
        const stateLabel = stateLabels[state] ?? state.toLowerCase()
        messages.push({
          type: 'info',
          text: `Cuando operas sintiéndote ${stateLabel}, tu ICO tiende a ser más bajo ` +
                `(promedio ${Math.round(avg * 100)}% vs ${Math.round(globalAvg * 100)}% general). ` +
                `Considera si es buena idea operar en ese estado.`,
        })
      }
    }
  }

  return NextResponse.json({ messages, weekAnalyzed })
}
