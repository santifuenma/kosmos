import { redirect } from 'next/navigation'
import { getServerSession, authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Tooltip } from '@/components/ui/Tooltip'
import { IcoCard } from '@/components/cards/IcoCard'
import { MonthlyCalendar } from '@/components/cards/MonthlyCalendar'
import { InfoIcon } from '@/components/icons'
import styles from './page.module.css'
import MonthNavigator from './MonthNavigator'

// ── Helpers ───────────────────────────────────────────────────────────────────

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function countSessionViolations(s: { violations: { id: string }[]; trades: { violations: { id: string }[] }[] }) {
  return s.violations.length + s.trades.reduce((ts, t) => ts + t.violations.length, 0)
}

// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  searchParams: Promise<{ year?: string; month?: string }>
}

export default async function HistoryPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const params = await searchParams
  const now = new Date()
  const year = params.year ? parseInt(params.year, 10) : now.getUTCFullYear()
  const month = params.month ? parseInt(params.month, 10) : now.getUTCMonth() + 1

  const startOfMonth = new Date(Date.UTC(year, month - 1, 1))
  const startOfNextMonth = new Date(Date.UTC(year, month, 1))

  // ── Available months (for the dropdown) ──────────────────────────────────
  const allSessionDates = await prisma.session.findMany({
    where: { userId: session.user.id, status: 'CLOSED' },
    select: { date: true },
    orderBy: { date: 'asc' },
  })

  const seenMonths = new Set<string>()
  const availableMonths: { year: number; month: number; label: string }[] = []
  for (const { date } of allSessionDates) {
    const d = new Date(date)
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth() + 1
    const key = `${y}-${m}`
    if (!seenMonths.has(key)) {
      seenMonths.add(key)
      availableMonths.push({
        year: y,
        month: m,
        label: capitalize(
          new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('es-ES', {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          }),
        ),
      })
    }
  }

  // ── Data fetch ────────────────────────────────────────────────────────────
  const monthSessions = await prisma.session.findMany({
    where: {
      userId: session.user.id,
      status: 'CLOSED',
      date: { gte: startOfMonth, lt: startOfNextMonth },
    },
    select: {
      id: true,
      date: true,
      icoScore: true,
      createdAt: true,
      closedAt: true,
      violations: { select: { id: true, rule: { select: { label: true } } } },
      trades: {
        select: {
          id: true,
          pnlAmount: true,
          violations: {
            select: {
              id: true,
              type: true,
              condition: { select: { label: true } },
              rule: { select: { label: true } },
            },
          },
        },
      },
      intention: {
        select: { emotionalState: true },
      },
    },
    orderBy: { date: 'asc' },
  })

  // ── Derived values ──────────────────────────────────────────────────────
  const monthLabel = capitalize(
    new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString('es-ES', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
  )

  const todayDisplay = capitalize(
    now.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
  )

  // ICO average
  const sessionsWithIco = monthSessions.filter((s) => s.icoScore !== null)
  const monthAvgIco =
    sessionsWithIco.length > 0
      ? sessionsWithIco.reduce((sum, s) => sum + (s.icoScore ?? 0), 0) / sessionsWithIco.length
      : null

  // Stats
  const totalSessions = monthSessions.length
  const totalViolations = monthSessions.reduce((sum, s) => sum + countSessionViolations(s), 0)
  const totalPnl = monthSessions.reduce(
    (sum, s) => sum + s.trades.reduce((ts, t) => ts + (t.pnlAmount ?? 0), 0),
    0,
  )

  // ── Feedback insights ────────────────────────────────────────────────────
  const insights: string[] = []

  // 1. Compare with previous month
  const prevMonthStart = new Date(Date.UTC(year, month - 2, 1))
  const prevMonthSessions = await prisma.session.findMany({
    where: {
      userId: session.user.id,
      status: 'CLOSED',
      date: { gte: prevMonthStart, lt: startOfMonth },
      icoScore: { not: null },
    },
    select: { icoScore: true },
  })

  if (prevMonthSessions.length > 0 && sessionsWithIco.length > 0) {
    const prevAvg = prevMonthSessions.reduce((s, x) => s + (x.icoScore ?? 0), 0) / prevMonthSessions.length
    const currentAvg = monthAvgIco!
    const diff = Math.round((currentAvg - prevAvg) * 100)
    if (diff > 0) {
      insights.push(`Mejoraste <strong>+${diff}%</strong> respecto al mes anterior.`)
    } else if (diff < 0) {
      insights.push(`Tu ICO bajó <strong>${diff}%</strong> respecto al mes anterior.`)
    } else {
      insights.push('Tu ICO se mantuvo igual respecto al mes anterior.')
    }
  }

  // 2. Most violated rule/condition
  const violationCounts = new Map<string, number>()
  for (const s of monthSessions) {
    for (const v of s.violations) {
      const label = v.rule?.label ?? 'Regla desconocida'
      violationCounts.set(label, (violationCounts.get(label) ?? 0) + 1)
    }
    for (const t of s.trades) {
      for (const v of t.violations) {
        const label = v.type === 'CONDITION_VIOLATION'
          ? v.condition?.label ?? 'Condición'
          : v.rule?.label ?? 'Regla'
        violationCounts.set(label, (violationCounts.get(label) ?? 0) + 1)
      }
    }
  }

  if (violationCounts.size > 0) {
    const sorted = Array.from(violationCounts.entries()).sort((a, b) => b[1] - a[1])
    insights.push(`La regla "<strong>${sorted[0][0]}</strong>" fue la más violada este mes.`)
  }

  // 3. Day-of-week pattern
  const dowViolations = [0, 0, 0, 0, 0, 0, 0]
  const dowSessions = [0, 0, 0, 0, 0, 0, 0]
  const dayNames = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados']

  for (const s of monthSessions) {
    const dow = new Date(s.date).getUTCDay()
    dowSessions[dow]++
    dowViolations[dow] += countSessionViolations(s)
  }

  const dowRates = dowViolations.map((v, i) => (dowSessions[i] > 0 ? v / dowSessions[i] : 0))
  const maxDowRate = Math.max(...dowRates)
  const maxDowIdx = dowRates.indexOf(maxDowRate)

  if (maxDowRate > 0 && dowSessions[maxDowIdx] >= 2) {
    insights.push(`<strong>Patrón detectado:</strong> tiendes a violar reglas los <strong>${dayNames[maxDowIdx]}</strong>.`)
  }

  // 4. Best emotional state
  const emoIcos = new Map<string, number[]>()
  for (const s of monthSessions) {
    if (s.icoScore === null || !s.intention?.emotionalState) continue
    const state = s.intention.emotionalState
    const arr = emoIcos.get(state) ?? []
    arr.push(s.icoScore)
    emoIcos.set(state, arr)
  }

  if (emoIcos.size > 1) {
    let bestState = ''
    let bestAvg = -1
    for (const [state, icos] of emoIcos) {
      const avg = icos.reduce((a, b) => a + b, 0) / icos.length
      if (avg > bestAvg) { bestAvg = avg; bestState = state }
    }
    const stateLabels: Record<string, string> = {
      NEUTRAL: 'Neutral',
      ANXIOUS: 'Ansioso',
      CONFIDENT: 'Confiado',
      FRUSTRATED: 'Frustrado',
      TIRED: 'Cansado',
    }
    insights.push(`Mejor rendimiento cuando tu estado emocional es <strong>${stateLabels[bestState] ?? bestState}</strong>.`)
  }

  // 5. ICO ↔ P&L correlation
  const sessionPnl = (s: typeof monthSessions[number]) =>
    s.trades.reduce((sum, t) => sum + (t.pnlAmount ?? 0), 0)

  const highIco = monthSessions.filter((s) => s.icoScore !== null && s.icoScore >= 0.80)
  const lowIco  = monthSessions.filter((s) => s.icoScore !== null && s.icoScore <  0.60)

  if (highIco.length > 0 && lowIco.length > 0) {
    const highAvg = highIco.reduce((sum, s) => sum + sessionPnl(s), 0) / highIco.length
    const lowAvg  = lowIco.reduce((sum, s)  => sum + sessionPnl(s), 0) / lowIco.length
    const fmt = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}$`
    const highVerb = highAvg >= 0 ? 'ganaste' : 'perdiste'
    const lowVerb  = lowAvg  >= 0 ? 'ganaste' : 'perdiste'
    insights.push(
      `Cuando fuiste disciplinado (ICO ≥ 80) <strong>${highVerb} ${fmt(highAvg)}</strong> de media.` +
      ` Cuando no (ICO &lt; 60), <strong>${lowVerb} ${fmt(lowAvg)}</strong>.`
    )
  }

  // 6. Talón de Aquiles multi-mes
  const twoMonthsAgoStart = new Date(Date.UTC(year, month - 3, 1))
  const prevTwoMonthsSessions = await prisma.session.findMany({
    where: {
      userId: session.user.id,
      status: 'CLOSED',
      date: { gte: twoMonthsAgoStart, lt: startOfMonth },
    },
    select: {
      date: true,
      violations: { select: { rule: { select: { label: true } } } },
      trades: {
        select: {
          violations: {
            select: {
              type: true,
              rule: { select: { label: true } },
            },
          },
        },
      },
    },
  })

  // Build a map: "year-month" → Set<ruleLabel>
  const rulesByMonth = new Map<string, Set<string>>()

  const addRules = (date: Date | string, violations: { rule: { label: string } | null }[], tradeViolations: { type: string; rule: { label: string } | null }[][]) => {
    const d = new Date(date)
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`
    if (!rulesByMonth.has(key)) rulesByMonth.set(key, new Set())
    const set = rulesByMonth.get(key)!
    for (const v of violations) if (v.rule?.label) set.add(v.rule.label)
    for (const tvs of tradeViolations) for (const v of tvs) if (v.type === 'RULE_VIOLATION' && v.rule?.label) set.add(v.rule.label)
  }

  for (const s of prevTwoMonthsSessions) addRules(s.date, s.violations, s.trades.map((t) => t.violations))
  for (const s of monthSessions)          addRules(s.date, s.violations, s.trades.map((t) => t.violations))

  if (rulesByMonth.size >= 3) {
    const monthSets = Array.from(rulesByMonth.values())
    const recurring = Array.from(monthSets[0]).filter((rule) => monthSets.every((set) => set.has(rule)))
    if (recurring.length > 0) {
      insights.push(
        `Llevas <strong>${rulesByMonth.size} meses seguidos</strong> violando` +
        ` "<strong>${recurring[0]}</strong>". Es tu patrón de indisciplina más persistente.`
      )
    }
  }

  // ── Calendar data ──────────────────────────────────────────────────────
  const sessionsByDate = new Map<number, { id: string; icoScore: number | null }>()
  for (const s of monthSessions) {
    sessionsByDate.set(new Date(s.date).getUTCDate(), { id: s.id, icoScore: s.icoScore })
  }

  return (
    <div className={styles.page}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <h1>Historial</h1>
        <span className={styles.date}>{todayDisplay}</span>
      </div>

      {/* ── Big history card: month bar + top row + calendar ───────────── */}
      <div className={`card ${styles.historyCard}`}>

        {/* ── Month bar ─────────────────────────────────────────────────── */}
        <div className={styles.monthBar}>
          <div className={styles.monthBarLeft}>
            <h3 className={styles.monthBarTitle}>
              Resumen Mensual
              <Tooltip text="Resumen general de tu rendimiento en el mes seleccionado: ICO promedio, estadísticas clave y retroalimentación basada en tus datos.">
                <InfoIcon />
              </Tooltip>
            </h3>
          </div>
          <MonthNavigator year={year} month={month} monthLabel={monthLabel} availableMonths={availableMonths} />
        </div>

        {/* ── Content that transitions on month change ─────────────────── */}
        <div key={`${year}-${month}`} className={styles.monthContent}>

          {/* ── Top row: ICO + Stats | Feedback ──────────────────────────── */}
          <div className={styles.topRow}>

            {/* Left column: ICO ring + Stats */}
            <div className={styles.icoCol}>
              <IcoCard
                score={monthAvgIco}
                title="ICO promedio del mes"
                tooltipText="Promedio del Índice de Coherencia Operativa de todas las sesiones cerradas en este mes. Mide tu disciplina operativa general."
                dateLabel={monthLabel}
              />

              <div className={`innerCard ${styles.statsInner}`}>
                <h3 className={styles.statsTitle}>
                  Estadísticas del mes
                  <Tooltip text="Resumen numérico del mes: sesiones completadas, violaciones totales acumuladas y resultado financiero neto.">
                    <InfoIcon />
                  </Tooltip>
                </h3>

                <div className={styles.statsRow}>
                  <div className={styles.statItem}>
                    <p className={styles.statValue}>{totalSessions}</p>
                    <p className={styles.statLabel}>Sesiones</p>
                  </div>
                  <div className={styles.statItem}>
                    <p className={styles.statValue}>{totalViolations}</p>
                    <p className={styles.statLabel}>Violaciones</p>
                  </div>
                  <div className={styles.statItem}>
                    <span className={`${styles.pnlBadge} ${totalPnl > 0 ? styles.pnlBadgeSuccess : totalPnl < 0 ? styles.pnlBadgeDanger : styles.pnlBadgeNeutral}`}>
                      {totalPnl > 0 ? '+' : ''}{totalPnl.toFixed(2)}
                    </span>
                    <p className={styles.statLabel}>P&L</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right column: Feedback */}
            <div className={styles.feedbackCol}>
              <div className={`innerCard ${styles.feedbackInner}`}>
                <h3 className={styles.feedbackTitle}>
                  Retroalimentación del mes
                  <Tooltip text="Análisis automático generado a partir de tus datos del mes. Incluye comparación con el mes anterior, patrones de violaciones y correlación con tu estado emocional.">
                    <InfoIcon />
                  </Tooltip>
                </h3>
                <div className={styles.statsDivider} />
                <div className={styles.feedbackBody}>
                  {insights.length > 0 ? (
                    insights.flatMap((text, i) => [
                      i > 0 ? <div key={`div-${i}`} className={styles.feedbackDivider} /> : null,
                      <p key={i} className={styles.feedbackText} dangerouslySetInnerHTML={{ __html: text }} />,
                    ]).filter(Boolean)
                  ) : (
                    <p className={styles.emptyFeedback}>
                      {totalSessions === 0
                        ? 'No hay sesiones registradas en este mes.'
                        : 'No hay suficientes datos para generar insights.'}
                    </p>
                  )}
                </div>
              </div>
            </div>

          </div>

          {/* ── Calendar ────────────────────────────────────────────────── */}
          <div className={`innerCard ${styles.calendarCard}`}>
            <MonthlyCalendar
              year={year}
              month={month}
              sessionsByDate={sessionsByDate}
            />
          </div>

        </div>
      </div>
    </div>
  )
}
