import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getServerSession, authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { capitalize } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'
import { IcoCard } from '@/components/cards/IcoCard'
import { SessionStatsCard } from '@/components/cards/SessionStatsCard'
import { TradesTable } from '@/components/cards/TradesTable'
import { InfoSvg, ClockIcon, BullseyeIcon, ArrowLeftIcon, CheckCircleIcon, XCircleIcon, MinusCircleIcon } from '@/components/icons'
import { EMOTIONAL_STATE_LABELS, type EmotionalState } from '@/types'
import styles from './page.module.css'

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const authSession = await getServerSession(authOptions)
  if (!authSession?.user?.id) redirect('/login')

  const sessionData = await prisma.session.findUnique({
    where: { id },
    include: {
      trades: {
        include: {
          violations: {
            include: {
              rule: true,
              condition: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      violations: {
        include: { rule: true },
      },
      intention: {
        select: {
          id: true,
          date: true,
          maxTrades: true,
          tradingHoursStart: true,
          tradingHoursEnd: true,
          emotionalState: true,
          notes: true,
          confirmedAt: true,
          strategyId: true,
        },
      },
    },
  })

  if (!sessionData) notFound()

  if (sessionData.userId !== authSession.user.id) {
    return (
      <div className={styles.unauthorized}>
        No tienes permiso para ver esta sesión.
      </div>
    )
  }

  if (sessionData.status === 'OPEN') redirect('/session/active')

  const strategy = await prisma.strategy.findUnique({
    where: { id: sessionData.intention.strategyId },
    include: {
      conditions: {
        include: { condition: true },
        orderBy: { condition: { label: 'asc' } },
      },
      rules: {
        include: { rule: true },
        orderBy: { rule: { label: 'asc' } },
      },
    },
  })

  // ── Cálculo de componentes del ICO ──────────────────────────────────────
  const Ts = sessionData.trades.length
  const activeConditions = strategy?.conditions.filter((c) => c.isActive) ?? []
  const activePerTradeRules = strategy?.rules.filter(
    (r) => r.isActive && r.rule.scope === 'PER_TRADE',
  ) ?? []
  const activePerSessionRules = strategy?.rules.filter(
    (r) => r.isActive && r.rule.scope === 'PER_SESSION',
  ) ?? []

  const Vs =
    sessionData.trades.reduce((sum, t) => sum + t.violations.length, 0) +
    sessionData.violations.length

  const icoDecimal = sessionData.icoScore ?? 1
  const icoPercent = Math.round(icoDecimal * 100)

  // ── Duración de la sesión ───────────────────────────────────────────────
  let sessionMinutes = 0
  if (sessionData.closedAt && sessionData.createdAt) {
    sessionMinutes = Math.round(
      (new Date(sessionData.closedAt).getTime() -
       new Date(sessionData.createdAt).getTime()) / 60000,
    )
  }

  // ── Análisis de violaciones para el desglose ────────────────────────────
  const conditionViolationCount = new Map<string, number>()
  const ruleViolationCount = new Map<string, number>()
  const conditionViolationTrades = new Map<string, string[]>()
  const ruleViolationTrades = new Map<string, string[]>()

  for (const trade of sessionData.trades) {
    const tradeLabel = `Trade ${sessionData.trades.indexOf(trade) + 1}${trade.asset ? ` (${trade.asset})` : ''}`
    for (const v of trade.violations) {
      if (v.type === 'CONDITION_VIOLATION' && v.conditionId) {
        conditionViolationCount.set(
          v.conditionId,
          (conditionViolationCount.get(v.conditionId) ?? 0) + 1,
        )
        const arr = conditionViolationTrades.get(v.conditionId) ?? []
        arr.push(tradeLabel)
        conditionViolationTrades.set(v.conditionId, arr)
      } else if (v.type === 'RULE_VIOLATION' && v.ruleId) {
        ruleViolationCount.set(
          v.ruleId,
          (ruleViolationCount.get(v.ruleId) ?? 0) + 1,
        )
        const arr = ruleViolationTrades.get(v.ruleId) ?? []
        arr.push(tradeLabel)
        ruleViolationTrades.set(v.ruleId, arr)
      }
    }
  }

  // Regla/condición más problemática (>50% de los trades).
  let mostViolatedLabel: string | null = null
  if (Ts > 0) {
    for (const sc of activeConditions) {
      const count = conditionViolationCount.get(sc.conditionId) ?? 0
      if (count > Ts / 2) { mostViolatedLabel = sc.condition.label; break }
    }
    if (!mostViolatedLabel) {
      for (const sr of activePerTradeRules) {
        const count = ruleViolationCount.get(sr.ruleId) ?? 0
        if (count > Ts / 2) { mostViolatedLabel = sr.rule.label; break }
      }
    }
  }

  // ── Insights de reflexión ──────────────────────────────────────────────
  // PnL disciplinado vs indisciplinado
  const cleanTrades = sessionData.trades.filter((t) => t.violations.length === 0)
  const dirtyTrades = sessionData.trades.filter((t) => t.violations.length > 0)
  const cleanPnl = cleanTrades.reduce((s, t) => s + (t.pnlAmount ?? 0), 0)
  const dirtyPnl = dirtyTrades.reduce((s, t) => s + (t.pnlAmount ?? 0), 0)
  const hasPnlData = sessionData.trades.some((t) => t.pnlAmount !== null)

  // Detección de fatiga (más violaciones en segunda mitad)
  let fatigueDetected = false
  if (Ts >= 4) {
    const half = Math.floor(Ts / 2)
    const firstHalfV = sessionData.trades.slice(0, half).reduce((s, t) => s + t.violations.length, 0)
    const secondHalfV = sessionData.trades.slice(half).reduce((s, t) => s + t.violations.length, 0)
    fatigueDetected = secondHalfV > firstHalfV && secondHalfV >= 2
  }

  // Estado emocional de riesgo
  const emotionalState = sessionData.intention.emotionalState
  const emotionIsRisky = ['ANXIOUS', 'FRUSTRATED', 'TIRED'].includes(emotionalState ?? '')

  // ── Fecha formateada ────────────────────────────────────────────────────
  const dateCapitalized = capitalize(
    new Date(sessionData.date).toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
  )

  const dateShort = new Date(sessionData.date).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })

  return (
    <div className={styles.page}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <h1>Resultado de Sesión</h1>
        <span className={styles.date}>{dateCapitalized}</span>
      </div>

      {/* ── Top card: meta info + ICO + reflexión ───────���───────────────── */}
      <div className={`card ${styles.topCard}`}>
        <div className={styles.topCardHeader}>
          <div className={styles.metaInfo}>
            <p className={styles.metaLine}>
              <ClockIcon className={styles.metaIcon} />
              Inicio: <span className={styles.metaValue}>{sessionData.intention.tradingHoursStart}</span>
              {' '}Fin: <span className={styles.metaValue}>{sessionData.intention.tradingHoursEnd}</span>
            </p>
            <p className={styles.metaLine}>
              <BullseyeIcon className={styles.metaIcon} />
              Estrategia: <span className={styles.metaValue}>{strategy?.name ?? '—'}</span>
            </p>
          </div>
          <Link href="/dashboard" className={`ctaBtn ctaBtnSecondary ${styles.backBtn}`}>
            <ArrowLeftIcon />
            Volver al Dashboard
          </Link>
        </div>

        <div className={styles.cardRow}>
          {/* ── ICO diario ───────────────────────────────────────────────── */}
          <div className={styles.icoInner}>
            <IcoCard
              score={icoDecimal}
              title="ICO diario obtenido"
              tooltipText="El Índice de Coherencia Operativa (ICO) mide tu disciplina, no los resultados financieros. Un ICO alto significa que seguiste tu estrategia correctamente."
              dateLabel={dateShort}
              violations={Vs}
            />
          </div>

          {/* ── Reflexión de sesión ──────────────────────────────────────── */}
          <div className={`innerCard ${styles.reflectionInner}`}>
            <h3 className={styles.cardTitle}>
              Reflexión de sesión
              <Tooltip text="Análisis personalizado basado en tu disciplina operativa y patrones detectados en esta sesión.">
                <InfoSvg />
              </Tooltip>
            </h3>
            <div className={styles.divider} />
            <div className={styles.reflectionBody}>
              {/* Mensaje principal según ICO */}
              {Vs === 0 ? (
                <p className={styles.reflectionText}>
                  <span className={styles.reflectionHighlight}>Sesión perfecta.</span>{' '}
                  Ejecutaste tu plan exactamente como lo definiste.
                </p>
              ) : icoPercent >= 85 ? (
                <p className={styles.reflectionText}>
                  Tuviste una <span className={styles.reflectionHighlight}>buena disciplina</span> hoy.
                  Ejecutaste tu plan con consistencia y respetaste la mayoría de tus reglas. Mantén este nivel.
                </p>
              ) : icoPercent >= 70 ? (
                <p className={styles.reflectionText}>
                  <span className={styles.reflectionHighlight}>Coherencia moderada.</span>{' '}
                  Revisa las reglas que te costó más cumplir y reflexiona sobre qué situaciones
                  las desencadenaron.
                </p>
              ) : (
                <p className={styles.reflectionText}>
                  Tu coherencia fue <span className={styles.reflectionHighlight}>baja</span> esta sesión.
                  Reflexiona sobre qué desviaciones se repitieron y si el contexto del mercado
                  influyó en tu comportamiento.
                </p>
              )}

              {/* Sin trades */}
              {Ts === 0 && (
                <p className={styles.reflectionText}>
                  No registraste operaciones esta sesión. Si el mercado no presentó oportunidades,{' '}
                  <span className={styles.reflectionHighlight}>no operar también es una decisión disciplinada</span>.
                </p>
              )}

              {/* Regla más violada */}
              {mostViolatedLabel && (
                <p className={styles.reflectionText}>
                  <span className={styles.reflectionHighlight}>&quot;{mostViolatedLabel}&quot;</span> fue
                  la regla más difícil de cumplir hoy.
                </p>
              )}

              {/* Uso del límite de trades */}
              {Ts > 0 && sessionData.intention.maxTrades > 0 && (
                <p className={styles.reflectionText}>
                  Usaste <span className={styles.reflectionHighlight}>{Ts} de {sessionData.intention.maxTrades}</span> trades
                  permitidos{Ts >= sessionData.intention.maxTrades
                    ? ' — alcanzaste tu límite.'
                    : '.'}
                </p>
              )}

              {/* PnL disciplinado vs indisciplinado */}
              {hasPnlData && dirtyTrades.length > 0 && cleanTrades.length > 0 && (
                <p className={styles.reflectionText}>
                  Trades disciplinados: <span className={styles.reflectionHighlight}>{cleanPnl >= 0 ? '+' : ''}{cleanPnl.toFixed(2)} USD</span>.{' '}
                  Trades con violaciones: <span className={styles.reflectionHighlight}>{dirtyPnl >= 0 ? '+' : ''}{dirtyPnl.toFixed(2)} USD</span>.
                </p>
              )}

              {/* Patrón de fatiga */}
              {fatigueDetected && (
                <p className={styles.reflectionText}>
                  Tus últimos trades tuvieron más violaciones que los primeros — posible{' '}
                  <span className={styles.reflectionHighlight}>fatiga o pérdida de enfoque</span> hacia el final.
                </p>
              )}

              {/* Estado emocional — solo si fue de riesgo y hubo violaciones */}
              {emotionIsRisky && Vs > 0 && (
                <p className={styles.reflectionText}>
                  Comenzaste sintiéndote{' '}
                  <span className={styles.reflectionHighlight}>
                    {EMOTIONAL_STATE_LABELS[emotionalState as EmotionalState].label.toLowerCase()}
                  </span>
                  . Considera cómo influyó ese estado en tus decisiones.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Middle card: resumen sesión + resumen trades ─────────────────── */}
      <div className="card">
        <div className={styles.cardRow}>
          {/* ── Resumen de la sesión ─────────────────────────────────────── */}
          <div className={styles.summaryInner}>
            <SessionStatsCard
              trades={Ts}
              maxTrades={sessionData.intention.maxTrades}
              violations={Vs}
              minutes={sessionMinutes}
              emotionalState={emotionalState}
            />
          </div>

          {/* ── Resumen de trades ────────────────────────────────────────── */}
          <div className={`innerCard ${styles.tradesInner}`}>
            <h3 className={styles.cardTitle}>
              Resumen de trades
              <Tooltip text="Detalle de cada operación registrada durante la sesión con sus violaciones y resultados.">
                <InfoSvg />
              </Tooltip>
            </h3>
            <div className={styles.divider} />
            <TradesTable trades={sessionData.trades} variant="static" showTotal />
          </div>
        </div>
      </div>

      {/* ── Desglose de violaciones ──────────────────────────────────────── */}
      {(activeConditions.length > 0 ||
        activePerTradeRules.length > 0 ||
        activePerSessionRules.length > 0) && (
        <div className={`card ${styles.violationsCard}`}>
          <h3 className={styles.cardTitle}>
            Resumen de violaciones
            <Tooltip text="Desglose del cumplimiento de cada condición y regla. Muestra cuántos trades cumplieron vs. total.">
              <InfoSvg />
            </Tooltip>
          </h3>
          <div className={styles.divider} />
          <div className={styles.violationsGrid}>
            {/* Condiciones de entrada */}
            {activeConditions.length > 0 && (
              <div className={styles.violationsCol}>
                <p className={styles.violationsColTitle}>Condiciones de entrada</p>
                <div className={styles.violationsColDivider} />
                {activeConditions.map((sc) => {
                  const count = conditionViolationCount.get(sc.conditionId) ?? 0
                  const violatedIn = conditionViolationTrades.get(sc.conditionId) ?? []
                  return (
                    <div key={sc.id} className={styles.violationsItem}>
                      <p className={styles.violationsLabel}>{sc.condition.label}</p>
                      {Ts === 0 ? (
                        <MinusCircleIcon className={styles.violationsNaIcon} />
                      ) : count === 0 ? (
                        <CheckCircleIcon className={styles.violationsOkIcon} />
                      ) : (
                        <Tooltip text={`Violada en: ${violatedIn.join(', ')}`}>
                          <XCircleIcon className={styles.violationsBadIcon} />
                        </Tooltip>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Reglas por trade */}
            {activePerTradeRules.length > 0 && (
              <div className={styles.violationsCol}>
                <p className={styles.violationsColTitle}>Reglas por trade</p>
                <div className={styles.violationsColDivider} />
                {activePerTradeRules.map((sr) => {
                  const count = ruleViolationCount.get(sr.ruleId) ?? 0
                  const violatedIn = ruleViolationTrades.get(sr.ruleId) ?? []
                  return (
                    <div key={sr.id} className={styles.violationsItem}>
                      <p className={styles.violationsLabel}>{sr.rule.label}</p>
                      {Ts === 0 ? (
                        <MinusCircleIcon className={styles.violationsNaIcon} />
                      ) : count === 0 ? (
                        <CheckCircleIcon className={styles.violationsOkIcon} />
                      ) : (
                        <Tooltip text={`Violada en: ${violatedIn.join(', ')}`}>
                          <XCircleIcon className={styles.violationsBadIcon} />
                        </Tooltip>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Reglas por sesión */}
            {activePerSessionRules.length > 0 && (
              <div className={styles.violationsCol}>
                <p className={styles.violationsColTitle}>Reglas por sesión</p>
                <div className={styles.violationsColDivider} />
                {activePerSessionRules.map((sr) => {
                  const wasViolated = sessionData.violations.some(
                    (v) => v.ruleId === sr.ruleId,
                  )
                  return (
                    <div key={sr.id} className={styles.violationsItem}>
                      <p className={styles.violationsLabel}>{sr.rule.label}</p>
                      {wasViolated ? (
                        <XCircleIcon className={styles.violationsBadIcon} />
                      ) : (
                        <CheckCircleIcon className={styles.violationsOkIcon} />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
