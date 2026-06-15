'use client'

// ─────────────────────────────────────────────────────────────────────────────
// /session/active — Página de sesión de trading en curso.
//
// Interfaz central donde el trader pasa tiempo durante su sesión.
// Tres principios de diseño:
//
//   1. REGISTRO POR EXCEPCIÓN: condiciones y reglas aparecen en verde
//      (cumplidas) por defecto. El trader solo marca las que incumplió.
//
//   2. FEEDBACK EN TIEMPO REAL: contadores de trades y violaciones se
//      actualizan inmediatamente tras cada registro.
//
//   3. CIERRE DELIBERADO: cerrar la sesión requiere revisar las reglas
//      PER_SESSION, forzando reflexión antes de finalizar.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Tooltip } from '@/components/ui/Tooltip'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SessionStatsCard } from '@/components/cards/SessionStatsCard'
import { TradesTable } from '@/components/cards/TradesTable'
import {
  InfoSvg, ClockIcon, BullseyeIcon, FlagIcon, BrainIcon,
  CheckCircleIcon, TipIcon, StopIcon, CloseIcon, CheckIcon,
  TrendUpIcon, TrendDownIcon, TrendFlatIcon, ArrowRightIcon, ArrowLeftIcon,
} from '@/components/icons'
import type {
  ActiveSessionData,
  StrategyWithRelations,
  TradeItem,
  TradeDirection,
  TradeResult,
  EmotionalState,
} from '@/types'
import { EMOTIONAL_STATE_LABELS } from '@/types'
import styles from './page.module.css'

function getTodayDisplay(): string {
  const now = new Date()
  const raw = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

export default function ActiveSessionPage() {
  const router = useRouter()

  // ── Datos principales ────────────────────────────────────────────────────
  const [sessionData, setSessionData] = useState<ActiveSessionData | null>(null)
  const [strategyData, setStrategyData] = useState<StrategyWithRelations | null>(null)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)

  // ── Estado del formulario de trade ───────────────────────────────────────
  const [showTradeForm, setShowTradeForm] = useState(false)
  const [tradeStep, setTradeStep] = useState<1 | 2>(1)
  const [tradeDirection, setTradeDirection] = useState<TradeDirection | null>(null)
  const [tradeResult, setTradeResult] = useState<TradeResult | null>(null)
  const [tradeAsset, setTradeAsset] = useState('')
  const [tradePnl, setTradePnl] = useState('')
  const [tradeNotes, setTradeNotes] = useState('')
  const [violatedConditionIds, setViolatedConditionIds] = useState<Set<string>>(new Set())
  const [violatedRuleIds, setViolatedRuleIds] = useState<Set<string>>(new Set())

  // ── Estado del paso de cierre ────────────────────────────────────────────
  const [showCloseStep, setShowCloseStep] = useState(false)
  const [violatedSessionRuleIds, setViolatedSessionRuleIds] = useState<Set<string>>(new Set())

  // ── Confirmación antes de cerrar sesión de trading ────────────────────
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)

  // ── Animaciones de modales ──────────────────────────────────────────────
  const [tradeFormClosing, setTradeFormClosing] = useState(false)
  const [closeStepClosing, setCloseStepClosing] = useState(false)
  const [stepDirection, setStepDirection] = useState<'forward' | 'backward'>('forward')

  // ── Control de envío ─────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // ── Minutos en sesión ────────────────────────────────────────────────────
  const [minutesInSession, setMinutesInSession] = useState(0)

  // ── Carga inicial ────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      try {
        const [sessionRes, strategyRes] = await Promise.all([
          fetch('/api/session/active'),
          fetch('/api/strategy'),
        ])

        if (sessionRes.status === 404) {
          router.replace('/session/new')
          return
        }

        if (!sessionRes.ok) {
          setPageError('Error al cargar la sesión.')
          return
        }
        if (!strategyRes.ok) {
          setPageError('Error al cargar la estrategia.')
          return
        }

        const [session, strategy] = await Promise.all([
          sessionRes.json() as Promise<ActiveSessionData>,
          strategyRes.json() as Promise<StrategyWithRelations>,
        ])

        setSessionData(session)
        setStrategyData(strategy)
      } catch {
        setPageError('Error de conexión. Inténtalo de nuevo.')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [router])

  // ── Timer de minutos en sesión ───────────────────────────────────────────
  useEffect(() => {
    if (!sessionData) return
    function calcMinutes() {
      const now = new Date()
      const start = new Date(sessionData!.createdAt)
      const diff = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 60000))
      setMinutesInSession(diff)
    }
    calcMinutes()
    const interval = setInterval(calcMinutes, 60000)
    return () => clearInterval(interval)
  }, [sessionData])

  // ── Valores derivados ────────────────────────────────────────────────────
  const activeConditions = strategyData?.conditions.filter((c) => c.isActive) ?? []
  const activePerTradeRules = strategyData?.rules.filter(
    (r) => r.isActive && r.rule.scope === 'PER_TRADE',
  ) ?? []
  const activePerSessionRules = strategyData?.rules.filter(
    (r) => r.isActive && r.rule.scope === 'PER_SESSION',
  ) ?? []

  const maxTrades = sessionData?.intention.maxTrades ?? 0
  const tradeCount = sessionData?.trades.length ?? 0
  const atMaxTrades = tradeCount >= maxTrades && maxTrades > 0

  const totalViolations =
    (sessionData?.trades.reduce((sum, t) => sum + t.violations.length, 0) ?? 0) +
    (sessionData?.violations.length ?? 0)

  // ── Toggle de violaciones ────────────────────────────────────────────────
  function toggleCondition(id: string) {
    setViolatedConditionIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleRule(id: string) {
    setViolatedRuleIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSessionRule(id: string) {
    setViolatedSessionRuleIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // ── Formulario de trade ──────────────────────────────────────────────────
  function handleOpenTradeForm() {
    setShowCloseStep(false)
    setCloseStepClosing(false)
    setSubmitError(null)
    setTradeStep(1)
    setStepDirection('forward')
    setTradeFormClosing(false)
    setShowTradeForm(true)
  }

  function handleCancelTradeForm() {
    setTradeFormClosing(true)
  }

  function handleTradeFormClosed() {
    setShowTradeForm(false)
    setTradeFormClosing(false)
    setTradeStep(1)
    setStepDirection('forward')
    setTradeDirection(null)
    setTradeResult(null)
    setTradeAsset('')
    setTradePnl('')
    setTradeNotes('')
    setViolatedConditionIds(new Set())
    setViolatedRuleIds(new Set())
    setSubmitError(null)
  }

  async function handleSubmitTrade() {
    if (!tradeDirection || !tradeResult) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch('/api/session/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction: tradeDirection,
          result: tradeResult,
          asset: tradeAsset.trim() || undefined,
          pnlAmount: tradePnl ? parseFloat(tradePnl) : undefined,
          notes: tradeNotes.trim() || undefined,
          violations: {
            conditions: Array.from(violatedConditionIds),
            rules: Array.from(violatedRuleIds),
          },
        }),
      })

      if (!res.ok) {
        let errorMsg = `Error ${res.status}: ${res.statusText}`
        try {
          const data = await res.json()
          if (data?.error) errorMsg = data.error
        } catch {
          // Si la respuesta no es JSON, usamos el status text
        }
        console.error('Trade submission failed:', errorMsg)
        setSubmitError(errorMsg)
        return
      }

      const newTrade: TradeItem = await res.json()
      setSessionData((prev) =>
        prev ? { ...prev, trades: [...prev.trades, newTrade] } : prev,
      )
      handleCancelTradeForm()
    } catch (err) {
      console.error('Trade submission error:', err)
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      setSubmitError(`Error de conexión: ${msg}`)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Cierre de sesión ─────────────────────────────────────────────────────
  function handleOpenCloseStep() {
    setShowTradeForm(false)
    setTradeFormClosing(false)
    setSubmitError(null)

    const maxTradesRule = activePerSessionRules.find(
      (r) => r.rule.code === 'MAX_TRADES_LIMIT',
    )
    const initialViolated = new Set<string>()
    if (maxTradesRule && tradeCount > maxTrades) {
      initialViolated.add(maxTradesRule.id)
    }
    setViolatedSessionRuleIds(initialViolated)
    setCloseStepClosing(false)
    setShowCloseStep(true)
  }

  function handleCancelCloseStep() {
    setCloseStepClosing(true)
  }

  function handleCloseStepClosed() {
    setShowCloseStep(false)
    setCloseStepClosing(false)
    setSubmitError(null)
  }

  async function handleConfirmClose() {
    if (!sessionData) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch('/api/session/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionViolations: Array.from(violatedSessionRuleIds),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setSubmitError(data.error ?? 'Error al cerrar la sesión.')
        return
      }

      const closedSession = await res.json()
      router.push(`/session/${closedSession.id}`)
    } catch {
      setSubmitError('Error de conexión. Inténtalo de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Renders condicionales ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.loadingState}>
        <p className={styles.loadingText}>Cargando sesión...</p>
      </div>
    )
  }

  if (pageError) {
    return (
      <div className={styles.errorState}>
        <p className={styles.errorText}>{pageError}</p>
      </div>
    )
  }

  if (!sessionData || !strategyData) return null

  const emotionInfo =
    EMOTIONAL_STATE_LABELS[sessionData.intention.emotionalState as EmotionalState]

  // Tip de disciplina del día (determinista por fecha, cambia cada día)
  const DAILY_TIPS = [
    'Sigue tus reglas aunque el mercado parezca obvio.',
    'Respeta tu Stop-Loss siempre, sin excepciones.',
    'La disciplina hoy construye la confianza de mañana.',
    'Si dudas, no entres. La claridad es una condición de entrada.',
    'No persigas el mercado. Si lo perdiste, habrá otra oportunidad.',
    'Un trade impulsivo puede borrar días de trabajo disciplinado.',
    'El objetivo no es acertar — es ejecutar el plan.',
    'La paciencia también es una posición.',
    'El mercado siempre estará mañana. Tu capital, no necesariamente.',
    'Opera tu estrategia, no tus emociones.',
    'Un día sin trades es un día sin violaciones.',
    'Las reglas existen para los días difíciles, no para los fáciles.',
    'El mejor trade que puedes hacer es no hacer el trade incorrecto.',
    'Reduce tu tamaño cuando el mercado no está claro.',
    'Anota cada operación. La reflexión es parte del proceso.',
  ]
  const dayIndex = Math.floor(Date.now() / 86_400_000) % DAILY_TIPS.length
  const dailyTip = DAILY_TIPS[dayIndex]

  // P&L de la sesión
  const sessionPnl = sessionData.trades.reduce((sum, t) => sum + (t.pnlAmount ?? 0), 0)
  const hasPnl = sessionData.trades.some((t) => t.pnlAmount !== null)

  // Fecha de la última sesión cerrada
  const displayDate = sessionData.previousSessionDate
    ? (() => {
        const prev = new Date(sessionData.previousSessionDate)
        const prevStr = prev.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
        const todayStr = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
        const yesterdayStr = new Date(Date.now() - 86_400_000).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
        if (prevStr === todayStr) return `Hoy, ${prevStr}`
        if (prevStr === yesterdayStr) return `Ayer, ${prevStr}`
        return prevStr
      })()
    : 'Sin sesiones anteriores'

  const dateDisplay = getTodayDisplay()

  // ── Render principal ─────────────────────────────────────────────────────
  return (
    <div className={styles.page}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <h1>Sesión Activa</h1>
        <span className={styles.date}>{dateDisplay}</span>
      </div>

      {/* ── Session card ───────────────────────────────────────────────── */}
      <div className={`card ${styles.sessionCard}`}>

        {/* Fila superior: info de sesión + botón cerrar */}
        <div className={styles.sessionTop}>
          <div className={styles.sessionInfo}>
            <div className={styles.sessionTitleRow}>
              <h3 className={styles.sessionTitle}>Última sesión</h3>
              <p className={styles.sessionDate}>{displayDate}</p>
            </div>
            <div className={styles.sessionMeta}>
              <p className={styles.metaLine}>
                <ClockIcon className={styles.metaIcon} />
                Inicio de sesión: <strong>{new Date(sessionData.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</strong>
              </p>

              <p className={styles.metaLine}>
                <BullseyeIcon className={styles.metaIcon} />
                Estrategia: <strong>{strategyData.name}</strong>
              </p>
              <p className={styles.metaLine}>
                <span className={styles.activeDot} />
                Estado: <strong className={styles.activeText}>Activa</strong>
              </p>
            </div>
          </div>

          {!showCloseStep && (
            <button
              className={`ctaBtn ctaBtnPrimary ${styles.closeSessionBtn}`}
              onClick={() => setShowCloseConfirm(true)}
            >
              <StopIcon className={styles.btnIcon} /> Cerrar Sesión
            </button>
          )}
        </div>

        {/* Fila de información: intención + estado */}
        <div className={styles.infoRow}>

          {/* Intención diaria */}
          <div className={`innerCard ${styles.intentionCard}`}>
            <h3 className={styles.cardSectionTitle}>
              Intención diaria
              <Tooltip text="Tu plan declarado antes de empezar: límite de trades, estado emocional y compromiso con las reglas de tu estrategia.">
                <InfoSvg />
              </Tooltip>
            </h3>
            <div className={styles.intentionDivider} />
            <div className={styles.intentionMeta}>
              <p className={styles.intentionLine}>
                <FlagIcon className={styles.intentionIcon} /> Límite de trades: <strong>{maxTrades}</strong>
              </p>
              <p className={styles.intentionLine}>
                <BrainIcon className={styles.intentionIcon} /> Estado emocional: <strong>{emotionInfo.label}</strong>
              </p>
              <p className={styles.intentionLine}>
                <CheckCircleIcon className={styles.intentionIcon} /> Compromiso con reglas: <strong>Aceptado</strong>
              </p>
            </div>
            <div className={styles.tipBar}>
              <TipIcon className={styles.tipIcon} />
              <p>{dailyTip}</p>
            </div>
          </div>

          {/* Estado de la sesión */}
          <div className={styles.statusCard}>
            <SessionStatsCard
              trades={tradeCount}
              maxTrades={maxTrades}
              violations={totalViolations}
              minutes={minutesInSession}
              title="Estado de la sesión"
              tooltipText="Métricas en tiempo real de tu sesión: trades realizados, violaciones cometidas y minutos transcurridos desde el inicio."
              variant="live"
            />
          </div>
        </div>
      </div>

      {/* ── Trades card ────────────────────────────────────────────────── */}
      <div className={`card ${styles.tradesCard}`}>
        <div className={styles.tradesHeader}>
          <div className={styles.tradesHeaderLeft}>
            <div className={styles.tradesHeaderTitle}>
              <h3>Registro de trades</h3>
              <Tooltip text="Todas las operaciones que has registrado en esta sesión. Click en una fila para ver el detalle y las violaciones asociadas.">
                <InfoSvg />
              </Tooltip>
            </div>
            <p className={styles.tradesStats}>
              <span>{totalViolations} {totalViolations === 1 ? 'violación' : 'violaciones'}</span>
              {hasPnl && (
                <>
                  {' · P&L '}
                  <span className={`${styles.pnlBadge} ${sessionPnl > 0 ? styles.pnlPos : sessionPnl < 0 ? styles.pnlNeg : styles.pnlNeutral}`}>
                    {sessionPnl >= 0 ? '+' : ''}{sessionPnl.toFixed(2)} USD
                  </span>
                </>
              )}
            </p>
          </div>
          {!showCloseStep && !showTradeForm && (
            <button
              className={`ctaBtn ctaBtnSecondary ${styles.registerBtn}`}
              onClick={handleOpenTradeForm}
            >
              + Registrar trade
            </button>
          )}
        </div>

        {/* Tabla de trades */}
        <TradesTable trades={sessionData.trades} variant="interactive" />
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className={styles.pageFooter}>
        <p className={styles.tradesCount}>
          Mostrando {tradeCount} {tradeCount === 1 ? 'trade registrado' : 'trades registrados'}
        </p>
      </div>

      {/* ── Modal de registro de trade (2 pasos) ───────────────────────── */}
      {showTradeForm && !showCloseStep && (
        <TradeForm
          step={tradeStep}
          stepDirection={stepDirection}
          closing={tradeFormClosing}
          onClosed={handleTradeFormClosed}
          activeConditions={activeConditions}
          activePerTradeRules={activePerTradeRules}
          tradeDirection={tradeDirection}
          tradeResult={tradeResult}
          tradeAsset={tradeAsset}
          tradePnl={tradePnl}
          tradeNotes={tradeNotes}
          violatedConditionIds={violatedConditionIds}
          violatedRuleIds={violatedRuleIds}
          submitting={submitting}
          submitError={submitError}
          onDirectionChange={setTradeDirection}
          onResultChange={setTradeResult}
          onAssetChange={setTradeAsset}
          onPnlChange={setTradePnl}
          onNotesChange={setTradeNotes}
          onToggleCondition={toggleCondition}
          onToggleRule={toggleRule}
          onNext={() => { setStepDirection('forward'); setTradeStep(2) }}
          onBack={() => { setStepDirection('backward'); setTradeStep(1) }}
          onSubmit={handleSubmitTrade}
          onCancel={handleCancelTradeForm}
        />
      )}

      {/* ── Overlay de cierre ──────────────────────────────────────────── */}
      {showCloseStep && (
        <CloseStepOverlay
          closing={closeStepClosing}
          onClosed={handleCloseStepClosed}
          activePerSessionRules={activePerSessionRules}
          violatedSessionRuleIds={violatedSessionRuleIds}
          tradeCount={tradeCount}
          maxTrades={maxTrades}
          submitting={submitting}
          submitError={submitError}
          onToggleSessionRule={toggleSessionRule}
          onConfirm={handleConfirmClose}
          onCancel={handleCancelCloseStep}
        />
      )}

      {/* ── Confirmación antes de cerrar sesión de trading ─────────────── */}
      <ConfirmDialog
        open={showCloseConfirm}
        title="¿Cerrar sesión de trading?"
        message="Al cerrar la sesión deberás revisar el cumplimiento de tus reglas. No podrás registrar más trades después."
        confirmLabel="Continuar"
        cancelLabel="Cancelar"
        variant="warning"
        onConfirm={() => { setShowCloseConfirm(false); handleOpenCloseStep() }}
        onCancel={() => setShowCloseConfirm(false)}
      />
    </div>
  )
}




// ─────────────────────────────────────────────────────────────────────────────
// TradeForm — Modal de registro de trade en 2 pasos.
//   Paso 1: Dirección, Resultado, Activo, PnL
//   Paso 2: Reglas cumplidas, Condiciones cumplidas, Observaciones
// ─────────────────────────────────────────────────────────────────────────────

type TradeFormProps = {
  step: 1 | 2
  stepDirection: 'forward' | 'backward'
  closing: boolean
  onClosed: () => void
  activeConditions: StrategyWithRelations['conditions']
  activePerTradeRules: StrategyWithRelations['rules']
  tradeDirection: TradeDirection | null
  tradeResult: TradeResult | null
  tradeAsset: string
  tradePnl: string
  tradeNotes: string
  violatedConditionIds: Set<string>
  violatedRuleIds: Set<string>
  submitting: boolean
  submitError: string | null
  onDirectionChange: (d: TradeDirection) => void
  onResultChange: (r: TradeResult) => void
  onAssetChange: (v: string) => void
  onPnlChange: (v: string) => void
  onNotesChange: (v: string) => void
  onToggleCondition: (id: string) => void
  onToggleRule: (id: string) => void
  onNext: () => void
  onBack: () => void
  onSubmit: () => void
  onCancel: () => void
}

function TradeForm({
  step, stepDirection, closing, onClosed,
  activeConditions, activePerTradeRules,
  tradeDirection, tradeResult, tradeAsset, tradePnl, tradeNotes,
  violatedConditionIds, violatedRuleIds,
  submitting, submitError,
  onDirectionChange, onResultChange, onAssetChange, onPnlChange, onNotesChange,
  onToggleCondition, onToggleRule, onNext, onBack, onSubmit, onCancel,
}: TradeFormProps) {
  const canGoNext = tradeDirection !== null && tradeResult !== null
  const canSubmit = canGoNext && !submitting

  const overlayClass = closing
    ? `${styles.overlay} ${styles.overlayClosing}`
    : styles.overlay

  const panelBase = step === 1
    ? `${styles.tradeModalPanel} ${styles.tradeModalPanelStep1}`
    : styles.tradeModalPanel
  const panelClass = closing
    ? `${panelBase} ${styles.modalClosing}`
    : panelBase

  const stepClass = stepDirection === 'forward'
    ? styles.stepForward
    : styles.stepBackward

  return (
    <div className={overlayClass}>
      <div
        className={panelClass}
        onAnimationEnd={(e) => {
          if (closing && e.currentTarget === e.target) onClosed()
        }}
      >

        {/* Header: X + título centrado */}
        <div className={styles.tradeModalHeader}>
          <button onClick={onCancel} className={styles.tradeModalClose} aria-label="Cerrar">
            <CloseIcon />
          </button>
          <h3 className={styles.tradeModalTitle}>Registro de Trade</h3>
        </div>

        <div className={styles.tradeModalDivider} />

        {/* ─── PASO 1 ───────────────────────────────────────────────────── */}
        {step === 1 && (
          <div key="step1" className={stepClass}>
            {/* Dirección */}
            <div className={styles.tradeFormSection}>
              <label className={styles.tradeFormSectionLabel}>
                Dirección de la operación
                <Tooltip text="LONG (alcista): compraste esperando subida. SHORT (bajista): vendiste esperando bajada.">
                  <InfoSvg />
                </Tooltip>
              </label>
              <div className={styles.directionGrid}>
                {([
                  { value: 'LONG', label: 'LONG', sublabel: 'Alcista', cls: styles.dirBtnLongActive, Icon: TrendUpIcon },
                  { value: 'SHORT', label: 'SHORT', sublabel: 'Bajista', cls: styles.dirBtnShortActive, Icon: TrendDownIcon },
                ] as const).map(({ value, label, sublabel, cls, Icon }) => (
                  <button
                    key={value}
                    onClick={() => onDirectionChange(value)}
                    className={tradeDirection === value ? `${styles.directionBtn} ${cls}` : styles.directionBtn}
                  >
                    <Icon />
                    <span className={styles.directionBtnLabel}>{label}</span>
                    <span className={styles.directionBtnSublabel}>{sublabel}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.tradeModalDivider} />

            {/* Resultado */}
            <div className={styles.tradeFormSection}>
              <label className={styles.tradeFormSectionLabel}>
                Resultado de la operación
                <Tooltip text="WIN: la operación cerró en ganancia. LOSS: cerró en pérdida. BREAKEVEN: cerró sin ganancia ni pérdida apreciable.">
                  <InfoSvg />
                </Tooltip>
              </label>
              <div className={styles.resultGrid}>
                {([
                  { value: 'WIN', label: 'WIN', cls: styles.resultBtnWin, Icon: TrendUpIcon },
                  { value: 'BREAKEVEN', label: 'BREAKEVEN', cls: styles.resultBtnBe, Icon: TrendFlatIcon },
                  { value: 'LOSS', label: 'LOSS', cls: styles.resultBtnLoss, Icon: TrendDownIcon },
                ] as const).map(({ value, label, cls, Icon }) => (
                  <button
                    key={value}
                    onClick={() => onResultChange(value as TradeResult)}
                    className={tradeResult === value ? `${styles.resultBtnLarge} ${cls}` : styles.resultBtnLarge}
                  >
                    <Icon />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.tradeModalDivider} />

            {/* Activo + PnL en fila */}
            <div className={styles.fieldRow}>
              <div className={styles.fieldCol}>
                <label className={styles.tradeFormFieldLabel}>
                  Activo operado
                  <Tooltip text="Ticker del instrumento operado (ej: QQQ, TSLA, BTC). Opcional.">
                    <InfoSvg />
                  </Tooltip>
                </label>
                <input
                  type="text"
                  value={tradeAsset}
                  onChange={(e) => onAssetChange(e.target.value.toUpperCase())}
                  placeholder="Ej: QQQ, TSLA..."
                  className={styles.tradeFormInput}
                />
              </div>
              <div className={styles.fieldCol}>
                <label className={styles.tradeFormFieldLabel}>
                  PnL de la operación
                  <Tooltip text="Ganancia o pérdida en USD. Usa números negativos para pérdidas (ej: -45). Opcional.">
                    <InfoSvg />
                  </Tooltip>
                </label>
                <input
                  type="number"
                  step="any"
                  value={tradePnl}
                  onChange={(e) => onPnlChange(e.target.value)}
                  placeholder="Ej: 48.00"
                  className={styles.tradeFormInput}
                />
              </div>
            </div>

            <div className={styles.tradeModalFooter}>
              <button
                onClick={onNext}
                disabled={!canGoNext}
                className={styles.tradeModalNextBtn}
              >
                <ArrowRightIcon /> Siguiente
              </button>
            </div>
          </div>
        )}

        {/* ─── PASO 2 ───────────────────────────────────────────────────── */}
        {step === 2 && (
          <div key="step2" className={stepClass}>
            <p className={styles.tradeModalSubtitle}>
              Desactiva las reglas o condiciones que no cumpliste durante la operación
            </p>

            <div className={styles.cumplimientoRow}>
              {/* Reglas cumplidas */}
              <div className={styles.cumplimientoCol}>
                <label className={styles.tradeFormSectionLabel}>
                  Reglas cumplidas
                  <Tooltip
                    position="above"
                    text="Reglas conductuales de tu estrategia. Por defecto están en verde (cumplidas). Desactiva las que NO cumpliste en esta operación."
                  >
                    <InfoSvg />
                  </Tooltip>
                </label>
                <div className={styles.toggleList}>
                  {activePerTradeRules.length === 0 ? (
                    <p className={styles.toggleListEmpty}>No tienes reglas activas.</p>
                  ) : (
                    activePerTradeRules.map((sr) => {
                      const violated = violatedRuleIds.has(sr.id)
                      const fulfilled = !violated
                      return (
                        <div key={sr.id} className={styles.toggleRow}>
                          <span className={styles.toggleRowLabel}>{sr.rule.label}</span>
                          <button
                            onClick={() => onToggleRule(sr.id)}
                            className={fulfilled ? `${styles.toggle} ${styles.toggleActive}` : styles.toggle}
                            aria-label={fulfilled ? 'Marcar como violada' : 'Marcar como cumplida'}
                          >
                            <span className={fulfilled ? `${styles.toggleThumb} ${styles.toggleThumbOn}` : styles.toggleThumb} />
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Condiciones cumplidas */}
              <div className={styles.cumplimientoCol}>
                <label className={styles.tradeFormSectionLabel}>
                  Condiciones cumplidas
                  <Tooltip
                    position="above"
                    text="Condiciones de entrada que debían cumplirse antes de operar. Desactiva las que NO se cumplieron al abrir esta operación."
                  >
                    <InfoSvg />
                  </Tooltip>
                </label>
                <div className={styles.toggleList}>
                  {activeConditions.length === 0 ? (
                    <p className={styles.toggleListEmpty}>No tienes condiciones activas.</p>
                  ) : (
                    activeConditions.map((sc) => {
                      const violated = violatedConditionIds.has(sc.id)
                      const fulfilled = !violated
                      return (
                        <div key={sc.id} className={styles.toggleRow}>
                          <span className={styles.toggleRowLabel}>{sc.condition.label}</span>
                          <button
                            onClick={() => onToggleCondition(sc.id)}
                            className={fulfilled ? `${styles.toggle} ${styles.toggleActive}` : styles.toggle}
                            aria-label={fulfilled ? 'Marcar como violada' : 'Marcar como cumplida'}
                          >
                            <span className={fulfilled ? `${styles.toggleThumb} ${styles.toggleThumbOn}` : styles.toggleThumb} />
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>

            <div className={styles.tradeModalDivider} />

            {/* Observaciones */}
            <div className={styles.tradeFormSection}>
              <label className={styles.tradeFormSectionLabel}>
                Observaciones de la operación
                <Tooltip
                  position="above"
                  text="Notas libres sobre esta operación: contexto del mercado, razones de entrada/salida, lecciones, etc. Opcional."
                >
                  <InfoSvg />
                </Tooltip>
              </label>
              <textarea
                value={tradeNotes}
                onChange={(e) => onNotesChange(e.target.value)}
                placeholder="Agrega cualquier observación que tengas de la operación..."
                rows={3}
                className={styles.tradeFormTextarea}
              />
            </div>

            {submitError && <p className={styles.submitError}>{submitError}</p>}

            <div className={styles.tradeModalFooterDouble}>
              <button onClick={onBack} disabled={submitting} className={styles.tradeModalBackBtn}>
                <ArrowLeftIcon /> Volver
              </button>
              <button onClick={onSubmit} disabled={!canSubmit} className={styles.tradeModalSubmitBtn}>
                <CheckIcon /> {submitting ? 'Guardando...' : 'Registrar trade'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// CloseStepOverlay — Revisión de reglas PER_SESSION antes de cerrar.
// ─────────────────────────────────────────────────────────────────────────────

type CloseStepOverlayProps = {
  closing: boolean
  onClosed: () => void
  activePerSessionRules: StrategyWithRelations['rules']
  violatedSessionRuleIds: Set<string>
  tradeCount: number
  maxTrades: number
  submitting: boolean
  submitError: string | null
  onToggleSessionRule: (id: string) => void
  onConfirm: () => void
  onCancel: () => void
}

function CloseStepOverlay({
  closing, onClosed,
  activePerSessionRules, violatedSessionRuleIds,
  tradeCount, maxTrades, submitting, submitError,
  onToggleSessionRule, onConfirm, onCancel,
}: CloseStepOverlayProps) {
  const overlayClass = closing
    ? `${styles.overlay} ${styles.overlayClosing}`
    : styles.overlay

  const panelClass = closing
    ? `${styles.tradeModalPanel} ${styles.closeModalPanel} ${styles.modalClosing}`
    : `${styles.tradeModalPanel} ${styles.closeModalPanel}`

  return (
    <div className={overlayClass}>
      <div
        className={panelClass}
        onAnimationEnd={(e) => {
          if (closing && e.currentTarget === e.target) onClosed()
        }}
      >

        {/* Header: X + título centrado */}
        <div className={styles.tradeModalHeader}>
          <button onClick={onCancel} className={styles.tradeModalClose} aria-label="Cerrar">
            <CloseIcon />
          </button>
          <h3 className={styles.tradeModalTitle}>Cierre de sesión</h3>
        </div>

        <div className={styles.tradeModalDivider} />

        {/* Subtítulo */}
        <p className={styles.tradeModalSubtitle}>
          Desactiva las reglas de sesión que no cumpliste durante esta sesión
        </p>

        {/* Lista de reglas con toggles */}
        <div className={styles.tradeFormSection}>
          <label className={styles.tradeFormSectionLabel}>
            Reglas cumplidas
            <Tooltip
              position="above"
              text="Reglas que aplican a toda la sesión (no a operaciones individuales). Por defecto están en verde. Desactiva las que NO cumpliste durante esta sesión."
            >
              <InfoSvg />
            </Tooltip>
          </label>
          <div className={styles.toggleList}>
            {activePerSessionRules.length === 0 ? (
              <p className={styles.toggleListEmpty}>No tienes reglas de sesión activas.</p>
            ) : (
              activePerSessionRules.map((sr) => {
                const violated = violatedSessionRuleIds.has(sr.id)
                const fulfilled = !violated
                return (
                  <div key={sr.id} className={styles.toggleRow}>
                    <span className={styles.toggleRowLabel}>{sr.rule.label}</span>
                    <button
                      onClick={() => onToggleSessionRule(sr.id)}
                      className={fulfilled ? `${styles.toggle} ${styles.toggleActive}` : styles.toggle}
                      aria-label={fulfilled ? 'Marcar como violada' : 'Marcar como cumplida'}
                    >
                      <span className={fulfilled ? `${styles.toggleThumb} ${styles.toggleThumbOn}` : styles.toggleThumb} />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className={styles.tradeModalDivider} />

        {submitError && <p className={styles.submitError}>{submitError}</p>}

        {/* Botón único de confirmar */}
        <div className={styles.tradeModalFooter}>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className={styles.tradeModalSubmitBtn}
          >
            <CheckIcon /> {submitting ? 'Cerrando...' : 'Confirmar y cerrar sesión'}
          </button>
        </div>
      </div>
    </div>
  )
}
