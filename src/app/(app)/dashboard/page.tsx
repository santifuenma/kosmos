import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getServerSession, authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Tooltip } from '@/components/ui/Tooltip'
import { IcoCard } from '@/components/cards/IcoCard'
import { PlayIcon, InfoIcon } from '@/components/icons'
import { MonthlyCalendar } from '@/components/cards/MonthlyCalendar'
import styles from './page.module.css'
import WeeklyChart from './WeeklyChart'

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ TEMPORAL — fija la fecha de referencia del dashboard a final de mayo 2026
// para mostrar datos de demo. Sustituye al `new Date()` real en todos los
// cálculos de hoy/semana/mes. Para restablecer la fecha actual:
//   1) Poner DEMO_TODAY = null
//   2) (Opcional) eliminar este bloque entero
// ─────────────────────────────────────────────────────────────────────────────
const DEMO_TODAY: Date | null = new Date(Date.UTC(2026, 4, 30, 12, 0, 0))
const refNow = () => (DEMO_TODAY ? new Date(DEMO_TODAY) : new Date())

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeDate(dateStr: string | Date): string {
  const date = new Date(dateStr)
  const now = refNow()
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dateUTC = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const diffDays = Math.round((todayUTC.getTime() - dateUTC.getTime()) / 86_400_000)
  const dayMonth = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' })
  if (diffDays === 0) return `Hoy, ${dayMonth}`
  if (diffDays === 1) return `Ayer, ${dayMonth}`
  return dayMonth
}

// ─────────────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const now = refNow()
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const startOfTomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const startOfNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))

  // ── Parallel data fetch ──────────────────────────────────────────────────
  const [strategy, todayIntention, lastClosedSession, monthSessions] = await Promise.all([
    prisma.strategy.findUnique({
      where: { userId: session.user.id },
      select: {
        id: true,
        name: true,
        maxTrades: true,
        tradingHoursStart: true,
        tradingHoursEnd: true,
        conditions: { where: { isActive: true }, select: { id: true } },
        rules: { where: { isActive: true }, select: { id: true } },
      },
    }),
    prisma.dailyIntention.findFirst({
      where: {
        userId: session.user.id,
        date: { gte: startOfToday, lt: startOfTomorrow },
      },
      include: {
        session: {
          select: {
            id: true,
            status: true,
            icoScore: true,
            createdAt: true,
            closedAt: true,
            _count: { select: { trades: true } },
            violations: { select: { id: true } },
            trades: { select: { violations: { select: { id: true } } } },
          },
        },
      },
    }),
    prisma.session.findFirst({
      where: {
        userId: session.user.id,
        status: 'CLOSED',
        date: { lt: startOfToday },
      },
      orderBy: { date: 'desc' },
      select: { id: true, date: true, icoScore: true, violations: { select: { id: true } }, trades: { select: { violations: { select: { id: true } } } } },
    }),
    prisma.session.findMany({
      where: {
        userId: session.user.id,
        status: 'CLOSED',
        date: { gte: startOfMonth, lt: startOfNextMonth },
      },
      select: {
        id: true,
        date: true,
        icoScore: true,
        violations: { select: { id: true } },
        trades: { select: { violations: { select: { id: true } }, pnlAmount: true } },
      },
      orderBy: { date: 'asc' },
    }),
  ])

  const userName = session.user.name ?? session.user.email ?? 'Trader'
  const todaySession = todayIntention?.session ?? null

  // ── Weekly ICO ───────────────────────────────────────────────────────────
  const currentWeekIco = await (async () => {
    const d = refNow()
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    const day = monday.getUTCDay()
    monday.setUTCDate(monday.getUTCDate() - (day === 0 ? 6 : day - 1))

    const sessions = await prisma.session.findMany({
      where: {
        userId: session.user.id,
        status: 'CLOSED',
        date: { gte: monday },
        icoScore: { not: null },
      },
      select: { icoScore: true },
    })

    if (sessions.length === 0) return null

    const icos = sessions.map((s) => s.icoScore as number)
    const mean = icos.reduce((a, b) => a + b, 0) / icos.length
    const variance = icos.reduce((sum, v) => sum + (v - mean) ** 2, 0) / icos.length
    const sd = Math.sqrt(variance)
    const stability = Math.max(0, Math.min(1, 1 - sd / 0.5))

    return {
      icoWeekly: Math.round((0.7 * mean + 0.3 * stability) * 100),
      sessionCount: sessions.length,
    }
  })()

  // ── Derived values ───────────────────────────────────────────────────────

  const ringScore: number | null =
    todaySession?.status === 'CLOSED' && todaySession.icoScore !== null
      ? todaySession.icoScore
      : lastClosedSession?.icoScore ?? null

  const monthAvgIco =
    monthSessions.length > 0
      ? Math.round(
        (monthSessions.reduce((sum, s) => sum + (s.icoScore ?? 0), 0) / monthSessions.length) * 100,
      )
      : null

  const countSessionViolations = (s: { violations: { id: string }[]; trades: { violations: { id: string }[] }[] }) =>
    s.violations.length + s.trades.reduce((ts, t) => ts + t.violations.length, 0)

  const monthViolations = monthSessions.reduce((sum, s) => sum + countSessionViolations(s), 0)
  const monthPnl = monthSessions.reduce(
    (sum, s) => sum + s.trades.reduce((ts, t) => ts + (t.pnlAmount ?? 0), 0),
    0,
  )
  const hasPnl = monthSessions.some((s) => s.trades.some((t) => t.pnlAmount !== null))

  function isoWeek(d: Date): number {
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    const dow = date.getUTCDay() || 7
    date.setUTCDate(date.getUTCDate() + 4 - dow)
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
    return Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  }

  function getMonday(d: Date): Date {
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    const day = date.getUTCDay() || 7
    date.setUTCDate(date.getUTCDate() - (day - 1))
    return date
  }

  const weekMap = new Map<number, { icos: number[]; monday: Date }>()
  for (const s of monthSessions) {
    if (s.icoScore === null) continue
    const date = new Date(s.date)
    const wk = isoWeek(date)
    const entry = weekMap.get(wk) ?? { icos: [], monday: getMonday(date) }
    entry.icos.push(s.icoScore * 100)
    weekMap.set(wk, entry)
  }

  const weeklyChartData = Array.from(weekMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([, { icos, monday }], i) => {
      const sunday = new Date(monday)
      sunday.setUTCDate(monday.getUTCDate() + 6)
      return {
        label: `${i + 1}`,
        ico: Math.round(icos.reduce((a, b) => a + b, 0) / icos.length),
        weekStart: monday.toISOString(),
        weekEnd: sunday.toISOString(),
      }
    })

  const sessionsByDate = new Map<number, { id: string; icoScore: number | null }>()
  for (const s of monthSessions) {
    sessionsByDate.set(new Date(s.date).getUTCDate(), { id: s.id, icoScore: s.icoScore })
  }

  const dateRaw = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  const dateDisplay = dateRaw.charAt(0).toUpperCase() + dateRaw.slice(1)
  const monthRaw = now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const monthDisplay = monthRaw.charAt(0).toUpperCase() + monthRaw.slice(1)

  // Session state flags
  const hasNoStrategy = !strategy
  const hasNoSession = !!strategy && !todayIntention
  const hasPendingIntention = !!strategy && !!todayIntention && !todayIntention.confirmedAt && !todaySession
  const hasOpenSession = !!strategy && todaySession?.status === 'OPEN'
  const hasClosedSession = !!strategy && todaySession?.status === 'CLOSED'

  // ICO ring meta
  const ringViolations =
    todaySession?.status === 'CLOSED'
      ? countSessionViolations(todaySession)
      : lastClosedSession
        ? countSessionViolations(lastClosedSession)
        : null

  const ringDateRef =
    todaySession?.status === 'CLOSED'
      ? formatRelativeDate(refNow())
      : lastClosedSession
        ? formatRelativeDate(lastClosedSession.date)
        : null

  return (
    <div className={styles.page}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <h1>Dashboard</h1>
        <div className={styles.greetingRow}>
          <h2 className={styles.greeting}>Hola, {userName}</h2>
          <span className={styles.greetingSep}>·</span>
          <span className={styles.date}>{dateDisplay}</span>
        </div>
      </div>

      {/* ── Session state card ───────────────────────────────────────────── */}
      <div className={`card ${styles.sessionCard}`}>

        <div className={styles.sessionInformation}>

          {/* A: no strategy configured */}
          {hasNoStrategy && (
            <>
              <div className={styles.sessionLeft}>
                <div className={styles.sessionStatus}>
                  <span className={`${styles.statusDot} ${styles.statusDotWarning}`} />
                  <span className={styles.statusLabel}>Sin estrategia configurada</span>
                </div>
                <p className={styles.sessionMeta}>
                  Define las condiciones de entrada y reglas conductuales de tu estrategia.
                </p>
              </div>
              <div className={styles.sessionRight}>
                <Link href="/strategy" className="ctaBtn ctaBtnPrimary">
                  Definir estrategia
                </Link>
              </div>
            </>
          )}

          {/* B: has strategy, no session today */}
          {hasNoSession && (
            <>
              <div className={styles.sessionLeft}>
                <div className={styles.sessionStatus}>
                  <span className={`${styles.statusDot} ${styles.statusDotDanger}`} />
                  <span className={styles.statusLabel}>No hay una sesión activa actualmente</span>
                </div>
                {lastClosedSession && (
                  <p className={`${styles.sessionMeta} ${styles.lastSession}`}>
                    Última sesión activa: <span className={styles.sessionMetaValue}>{formatRelativeDate(lastClosedSession.date)}</span>
                  </p>
                )}
                {strategy && (
                  <p className={`${styles.sessionMeta} ${styles.strategy}`}>
                    Estrategia:{' '}
                    <span className={styles.sessionMetaValue}>{strategy.name}</span>
                  </p>
                )}
              </div>
              <div className={styles.sessionRight}>
                <Link href="/session/new" className="ctaBtn ctaBtnPrimary">
                  <PlayIcon />
                  Iniciar nueva Sesión
                </Link>
              </div>
            </>
          )}

          {/* C: intention created but not confirmed */}
          {hasPendingIntention && (
            <>
              <div className={styles.sessionLeft}>
                <div className={styles.sessionStatus}>
                  <span className={`${styles.statusDot} ${styles.statusDotGray}`} />
                  <span className={styles.statusLabel}>Plan del día guardado</span>
                </div>
                <p className={styles.sessionMeta}>Has declarado tu intención pero la sesión aún no está abierta.</p>
                {strategy && (
                  <p className={`${styles.sessionMeta} ${styles.strategy}`}>
                    Estrategia:{' '}
                    <span className={styles.sessionMetaValue}>{strategy.name}</span>
                  </p>
                )}
              </div>
              <div className={styles.sessionRight}>
                <Link href="/session/new" className="ctaBtn ctaBtnPrimary">
                  <PlayIcon />
                  Confirmar y abrir sesión
                </Link>
              </div>
            </>
          )}

          {/* D: session open */}
          {hasOpenSession && (
            <>
              <div className={styles.sessionLeft}>
                <div className={styles.sessionStatus}>
                  <span className={`${styles.statusDot} ${styles.statusDotSuccess}`} />
                  <span className={styles.statusLabel}>Sesión activa en curso</span>
                </div>
                {todaySession && (
                  <p className={styles.sessionMeta}>
                    Operaciones registradas: <span className={styles.sessionMetaValue}>{todaySession._count.trades}{' '} de máximo {strategy!.maxTrades}</span>
                  </p>
                )}
                {strategy && (
                  <p className={`${styles.sessionMeta} ${styles.strategy}`}>
                    Estrategia:{' '}
                    <span className={styles.sessionMetaValue}>{strategy.name}</span>
                  </p>
                )}
              </div>
              <div className={styles.sessionRight}>
                <Link href="/session/active" className="ctaBtn ctaBtnPrimary">
                  Ir a la sesión
                </Link>
              </div>
            </>
          )}

          {/* E: session closed */}
          {hasClosedSession && (
            <>
              <div className={styles.sessionLeft}>
                <div className={styles.sessionStatus}>
                  <span className={`${styles.statusDot} ${styles.statusDotGray}`} />
                  <span className={styles.statusLabel}>Sesión de hoy completada</span>
                </div>
                {todaySession && (
                  <p className={styles.sessionMeta}>
                    Operaciones registradas: <span className={styles.sessionMetaValue}>{todaySession._count.trades}{' '} de máximo {strategy!.maxTrades}</span>
                  </p>
                )}
                {strategy && (
                  <p className={`${styles.sessionMeta} ${styles.strategy}`}>
                    Estrategia:{' '}
                    <span className={styles.sessionMetaValue}>{strategy.name}</span>
                  </p>
                )}
              </div>
              <div className={styles.sessionRight}>
                <div className={styles.sessionActions}>
                  <Link href={`/session/${todaySession!.id}`} className="ctaBtn ctaBtnPrimary">
                    Ver resumen de sesión
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Metrics row ─────────────────────────────────────────────────── */}
        <div className={styles.metricsRow}>

          {/* ICO ring card */}
          <div className={styles.icoCard}>
            <IcoCard
              score={ringScore}
              title="Último ICO diario"
              tooltipText="El ICO (Índice de Coherencia Operativa) mide qué tan fiel fuiste a tu estrategia en la última sesión cerrada. 100 significa cero violaciones registradas."
              dateLabel={ringDateRef}
              violations={ringViolations}
            />
          </div>

          {/* Weekly trend chart */}
          <div className={`innerCard ${styles.chartCard}`}>
            <h3 className={styles.chartTitle}>
              Tu tendencia en el último mes
              <Tooltip text="ICO promedio por semana del mes actual. Te permite ver si tu disciplina operativa está mejorando o empeorando con el tiempo.">
                <InfoIcon />
              </Tooltip>
            </h3>
            <div className={styles.chartWrap}>
              <WeeklyChart data={weeklyChartData} />
            </div>
          </div>

        </div>

      </div>



      {/* ── Monthly calendar ─────────────────────────────────────────────── */}
      <div className={`card ${styles.calendarCard}`}>

        <div className={styles.calendarHeader}>
          <h3 className={styles.calendarTitle}>
            Tus sesiones en el último mes
            <span className={styles.calendarTitleSep}>·</span>
            <span className={styles.calendarMonth}>{monthDisplay}</span>
            <Tooltip
              wrapClassName={styles.infoWrapCalendar}
              text="Cada punto representa una sesión cerrada. Verde = ICO ≥ 85, amarillo = ICO ≥ 70, rojo = ICO < 70. Los días sin punto no tuvieron sesión registrada."
            >
              <InfoIcon />
            </Tooltip>
          </h3>
        </div>

        <p className={styles.calendarStats}>
          <span className={styles.calendarStatsMain}>
            {monthAvgIco !== null && (
              <>
                <span className={styles.calStatHighlight}>{monthAvgIco}</span>
                <span className={styles.calStatDenom}>/100</span>{' '}
              </>
            )}
            {monthAvgIco !== null && 'ICO promedio · '}
            {monthSessions.length} {monthSessions.length === 1 ? 'sesión' : 'sesiones'}
            {' · '}
            {monthViolations} {monthViolations === 1 ? 'violación' : 'violaciones'}
          </span>
          {hasPnl && (
            <span className={styles.calendarStatsPnl}>
              {' · '}
              {'P&L '}
              <span className={`${styles.pnlBadge} ${monthPnl > 0 ? styles.pnlBadgePos : monthPnl < 0 ? styles.pnlBadgeNeg : styles.pnlBadgeNeutral}`}>
                {monthPnl >= 0 ? '+' : ''}{monthPnl.toFixed(2)} USD
              </span>
            </span>
          )}
        </p>

        <MonthlyCalendar
          year={now.getUTCFullYear()}
          month={now.getUTCMonth() + 1}
          sessionsByDate={sessionsByDate}
        />

      </div>
    </div>
  )
}

