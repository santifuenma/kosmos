'use client'

// ─────────────────────────────────────────────────────────────────────────────
// OnboardingFlow — primera entrada a Kosmos.
//
// Se muestra en lugar de la aplicación mientras el usuario no tenga estrategia
// (ver src/app/(app)/layout.tsx). No es saltable: hasta que no crea su
// estrategia no hay dashboard, historial ni sesiones, porque sin ella el ICO
// no puede calcularse contra nada.
//
// Dos pantallas:
//   WelcomeScreen  → marca + propuesta de valor + CTA
//   StrategyModal  → formulario en 2 pasos, misma estructura visual que el
//                    modal de registro de trade (session/active):
//                      Paso 1 → nombre, descripción y límites operativos
//                      Paso 2 → reglas conductuales y condiciones de entrada
//
// Todo se recoge en cliente y se envía en un único POST /api/strategy al
// final. Así el usuario puede volver atrás sin dejar estrategias a medias en
// la base de datos.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import Image from 'next/image'
import { welcomeLabel } from '@/lib/gender'
import type { CatalogResponse, BehavioralRuleItem, EntryConditionItem } from '@/types'
import { Tooltip } from '@/components/ui/Tooltip'
import {
  BullseyeIcon, ArrowRightIcon, ArrowLeftIcon, CheckIcon, CloseIcon, InfoSvg,
} from '@/components/icons'
import styles from './OnboardingFlow.module.css'

export default function OnboardingFlow() {
  const router = useRouter()

  // ── Navegación del flujo ───────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [stepDirection, setStepDirection] = useState<'forward' | 'backward'>('forward')

  // ── Paso 1: datos de la estrategia ─────────────────────────────────────
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [maxTrades, setMaxTrades] = useState(3)
  const [tradingHoursStart, setTradingHoursStart] = useState('09:00')
  const [tradingHoursEnd, setTradingHoursEnd] = useState('11:30')

  // ── Paso 2: catálogo y selección ───────────────────────────────────────
  // El catálogo se pide una sola vez al abrir el modal. activeRuleIds y
  // activeConditionIds arrancan con TODO seleccionado: el usuario desactiva
  // lo que no aplica a su operativa, igual que en el modal de trade.
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null)
  const [catalogError, setCatalogError] = useState('')
  const [activeRuleIds, setActiveRuleIds] = useState<Set<string>>(new Set())
  const [activeConditionIds, setActiveConditionIds] = useState<Set<string>>(new Set())

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!modalOpen || catalog) return

    fetch('/api/catalog')
      .then((res) => {
        if (!res.ok) throw new Error()
        return res.json()
      })
      .then((data: CatalogResponse) => {
        setCatalog(data)
        setActiveRuleIds(new Set(data.rules.map((r) => r.id)))
        setActiveConditionIds(new Set(data.conditions.map((c) => c.id)))
      })
      .catch(() => setCatalogError('No se pudo cargar el catálogo. Recarga la página.'))
  }, [modalOpen, catalog])

  function toggle(set: Set<string>, id: string): Set<string> {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }

  function handleNext() {
    if (tradingHoursStart >= tradingHoursEnd) {
      setError('El horario de inicio debe ser anterior al de fin')
      return
    }
    setError('')
    setStepDirection('forward')
    setStep(2)
  }

  function handleBack() {
    setError('')
    setStepDirection('backward')
    setStep(1)
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError('')

    const res = await fetch('/api/strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description,
        maxTrades,
        tradingHoursStart,
        tradingHoursEnd,
        activeConditionIds: [...activeConditionIds],
        activeRuleIds: [...activeRuleIds],
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'No se pudo crear la estrategia. Inténtalo de nuevo.')
      setSubmitting(false)
      return
    }

    // El layout es un Server Component que decide entre onboarding y app según
    // exista estrategia. refresh() lo vuelve a ejecutar: ahora la encuentra y
    // renderiza el dashboard, sin recarga completa de la página.
    router.refresh()
  }

  const canGoNext = name.trim().length > 0
  const hasSelection = activeRuleIds.size > 0 || activeConditionIds.size > 0
  const canSubmit = canGoNext && hasSelection && !!catalog && !submitting

  return (
    <div className={styles.screen}>
      <WelcomeScreen onStart={() => setModalOpen(true)} dimmed={modalOpen} />

      {modalOpen && (
        <StrategyModal
          step={step}
          stepDirection={stepDirection}
          closing={closing}
          onClosed={() => {
            setClosing(false)
            setModalOpen(false)
          }}
          onCancel={() => setClosing(true)}
          name={name}
          description={description}
          maxTrades={maxTrades}
          tradingHoursStart={tradingHoursStart}
          tradingHoursEnd={tradingHoursEnd}
          onNameChange={setName}
          onDescriptionChange={setDescription}
          onMaxTradesChange={setMaxTrades}
          onStartChange={setTradingHoursStart}
          onEndChange={setTradingHoursEnd}
          catalog={catalog}
          catalogError={catalogError}
          activeRuleIds={activeRuleIds}
          activeConditionIds={activeConditionIds}
          onToggleRule={(id) => setActiveRuleIds((s) => toggle(s, id))}
          onToggleCondition={(id) => setActiveConditionIds((s) => toggle(s, id))}
          canGoNext={canGoNext}
          canSubmit={canSubmit}
          hasSelection={hasSelection}
          submitting={submitting}
          error={error}
          onNext={handleNext}
          onBack={handleBack}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  )
}

// ── WelcomeScreen ────────────────────────────────────────────────────────────
// Marca a pantalla completa sobre el fondo de la app. El saludo actúa de
// antetítulo y el logotipo es la pieza principal, de modo que el tamaño y el
// contraste crecen en la misma dirección.
//
// El saludo concuerda con el género declarado en el registro: "Bienvenido a",
// "Bienvenida a" o, sin marca de género, "Te damos la bienvenida a".

function WelcomeScreen({ onStart, dimmed }: { onStart: () => void; dimmed: boolean }) {
  const { data: authSession } = useSession()
  const greeting = welcomeLabel(authSession?.user?.gender ?? 'UNDISCLOSED')

  return (
    <div className={dimmed ? `${styles.welcome} ${styles.welcomeDimmed}` : styles.welcome}>
      <p className={styles.eyebrow}>{greeting}</p>

      <Image
        src="/kosmos-logo.svg"
        alt="Kosmos"
        width={319}
        height={82}
        priority
        className={styles.logo}
      />

      <p className={styles.tagline}>
        Mide tu coherencia operativa y opera desde la disciplina, no la suerte.
      </p>

      <button onClick={onStart} className={`ctaBtn ctaBtnPrimary ${styles.startBtn}`}>
        <BullseyeIcon />
        Define tu estrategia
      </button>

      <p className={styles.requiredNote}>
        Necesitamos tu estrategia para poder medir tu coherencia. Solo se hace una vez.
      </p>

      {/* Salida del onboarding: el usuario ya está autenticado y sin esto no
          tendría forma de cerrar sesión antes de crear su estrategia (aquí no
          hay Navbar todavía). Mismo estilo de enlace subrayado que el "Inicia
          sesión / Regístrate" de los formularios de auth. */}
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: '/login' })}
        className={styles.logoutLink}
      >
        Cerrar sesión
      </button>
    </div>
  )
}

// ── StrategyModal ────────────────────────────────────────────────────────────
// Réplica de la estructura del modal de registro de trade: cabecera con título
// centrado, divisores, contenido por pasos y footer con las acciones.

type StrategyModalProps = {
  step: 1 | 2
  stepDirection: 'forward' | 'backward'
  closing: boolean
  onClosed: () => void
  onCancel: () => void
  name: string
  description: string
  maxTrades: number
  tradingHoursStart: string
  tradingHoursEnd: string
  onNameChange: (v: string) => void
  onDescriptionChange: (v: string) => void
  onMaxTradesChange: (v: number) => void
  onStartChange: (v: string) => void
  onEndChange: (v: string) => void
  catalog: CatalogResponse | null
  catalogError: string
  activeRuleIds: Set<string>
  activeConditionIds: Set<string>
  onToggleRule: (id: string) => void
  onToggleCondition: (id: string) => void
  canGoNext: boolean
  canSubmit: boolean
  hasSelection: boolean
  submitting: boolean
  error: string
  onNext: () => void
  onBack: () => void
  onSubmit: () => void
}

function StrategyModal({
  step, stepDirection, closing, onClosed, onCancel,
  name, description, maxTrades, tradingHoursStart, tradingHoursEnd,
  onNameChange, onDescriptionChange, onMaxTradesChange, onStartChange, onEndChange,
  catalog, catalogError, activeRuleIds, activeConditionIds, onToggleRule, onToggleCondition,
  canGoNext, canSubmit, hasSelection, submitting, error,
  onNext, onBack, onSubmit,
}: StrategyModalProps) {
  const overlayClass = closing
    ? `${styles.overlay} ${styles.overlayClosing}`
    : styles.overlay

  const panelBase = step === 1
    ? `${styles.modalPanel} ${styles.modalPanelStep1}`
    : styles.modalPanel
  const panelClass = closing ? `${panelBase} ${styles.modalClosing}` : panelBase

  const stepClass = stepDirection === 'forward' ? styles.stepForward : styles.stepBackward

  const perTradeRules = catalog?.rules.filter((r) => r.scope === 'PER_TRADE') ?? []
  const perSessionRules = catalog?.rules.filter((r) => r.scope === 'PER_SESSION') ?? []

  return (
    <div className={overlayClass}>
      <div
        className={panelClass}
        role="dialog"
        aria-modal="true"
        aria-label="Definir estrategia"
        onAnimationEnd={(e) => {
          if (closing && e.currentTarget === e.target) onClosed()
        }}
      >

        {/* Header: X + título centrado. La X vuelve a la bienvenida, no
            salta el onboarding: sin estrategia no hay acceso a la app. */}
        <div className={styles.modalHeader}>
          <button onClick={onCancel} className={styles.modalClose} aria-label="Volver a la bienvenida">
            <CloseIcon />
          </button>
          <h3 className={styles.modalTitle}>Define tu estrategia</h3>
          <span className={styles.stepCounter}>Paso {step} de 2</span>
        </div>

        <div className={styles.modalDivider} />

        {/* ─── PASO 1: datos y límites ──────────────────────────────────── */}
        {step === 1 && (
          <div key="step1" className={stepClass}>
            <p className={styles.modalSubtitle}>
              Tu estrategia es el plan con el que te comprometes antes de operar
            </p>

            <div className={styles.fieldCol}>
              <label className={styles.fieldLabel}>
                Nombre de la estrategia
                <Tooltip text="Un nombre corto que identifique tu sistema operativo. Ej: Momentum en apertura NY.">
                  <InfoSvg />
                </Tooltip>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Ej: Momentum en apertura NY"
                className={styles.modalInput}
              />
            </div>

            <div className={styles.fieldCol}>
              <label className={styles.fieldLabel}>
                Descripción <span className={styles.optional}>(opcional)</span>
                <Tooltip text="Describe brevemente tu enfoque: qué operas, en qué marco temporal y bajo qué lógica.">
                  <InfoSvg />
                </Tooltip>
              </label>
              <textarea
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                rows={3}
                placeholder="Describe brevemente tu enfoque operativo..."
                className={styles.modalTextarea}
              />
            </div>

            <div className={styles.modalDivider} />

            <div className={styles.limitsSection}>
              <label className={styles.sectionLabel}>
                Límites operativos
                <Tooltip text="Se aplican automáticamente a cada sesión. Superarlos cuenta como infracción en el cálculo del ICO.">
                  <InfoSvg />
                </Tooltip>
              </label>

              <div className={styles.fieldRow}>
                <div className={styles.fieldCol}>
                  <label className={styles.fieldLabel}>Máx. operaciones</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={maxTrades}
                    onChange={(e) => onMaxTradesChange(parseInt(e.target.value, 10) || 1)}
                    className={styles.modalInput}
                  />
                </div>
                <div className={styles.fieldCol}>
                  <label className={styles.fieldLabel}>Hora de inicio</label>
                  <input
                    type="time"
                    value={tradingHoursStart}
                    onChange={(e) => onStartChange(e.target.value)}
                    className={styles.modalInput}
                  />
                </div>
                <div className={styles.fieldCol}>
                  <label className={styles.fieldLabel}>Hora de fin</label>
                  <input
                    type="time"
                    value={tradingHoursEnd}
                    onChange={(e) => onEndChange(e.target.value)}
                    className={styles.modalInput}
                  />
                </div>
              </div>
            </div>

            {error && <p className={styles.errorText}>{error}</p>}

            <div className={styles.modalFooter}>
              <button onClick={onNext} disabled={!canGoNext} className={styles.modalNextBtn}>
                <ArrowRightIcon /> Siguiente
              </button>
            </div>
          </div>
        )}

        {/* ─── PASO 2: reglas y condiciones ─────────────────────────────── */}
        {step === 2 && (
          <div key="step2" className={stepClass}>
            <p className={styles.modalSubtitle}>
              Desactiva las reglas o condiciones que no apliquen a tu operativa
            </p>

            {catalogError ? (
              <p className={styles.errorText}>{catalogError}</p>
            ) : !catalog ? (
              <p className={styles.loadingText}>Cargando catálogo...</p>
            ) : (
              <div className={styles.cumplimientoRow}>
                {/* Reglas conductuales, agrupadas por scope igual que en
                    la página de estrategia. */}
                <div className={styles.cumplimientoCol}>
                  <label className={styles.sectionLabel}>
                    Reglas conductuales
                    <Tooltip
                      position="above"
                      text="Compromisos de disciplina que te propones cumplir. Se evalúan por operación o por sesión según su alcance."
                    >
                      <InfoSvg />
                    </Tooltip>
                  </label>
                  <div className={styles.toggleList}>
                    {perTradeRules.length > 0 && (
                      <>
                        <p className={styles.groupLabel}>Por operación</p>
                        {perTradeRules.map((r) => (
                          <ToggleRow
                            key={r.id}
                            item={r}
                            active={activeRuleIds.has(r.id)}
                            onToggle={() => onToggleRule(r.id)}
                          />
                        ))}
                      </>
                    )}
                    {perSessionRules.length > 0 && (
                      <>
                        <p className={styles.groupLabel}>Por sesión</p>
                        {perSessionRules.map((r) => (
                          <ToggleRow
                            key={r.id}
                            item={r}
                            active={activeRuleIds.has(r.id)}
                            onToggle={() => onToggleRule(r.id)}
                          />
                        ))}
                      </>
                    )}
                  </div>
                </div>

                {/* Condiciones de entrada */}
                <div className={styles.cumplimientoCol}>
                  <label className={styles.sectionLabel}>
                    Condiciones de entrada
                    <Tooltip
                      position="above"
                      text="Criterios técnicos que deben cumplirse antes de abrir una operación. Entrar sin ellos se registra como infracción."
                    >
                      <InfoSvg />
                    </Tooltip>
                  </label>
                  <div className={styles.toggleList}>
                    {catalog.conditions.map((c) => (
                      <ToggleRow
                        key={c.id}
                        item={c}
                        active={activeConditionIds.has(c.id)}
                        onToggle={() => onToggleCondition(c.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {catalog && !hasSelection && (
              <p className={styles.hintText}>
                Activa al menos una regla o condición: el ICO mide tu cumplimiento
                frente a ellas, y sin ninguna no habría nada que medir.
              </p>
            )}

            {error && <p className={styles.errorText}>{error}</p>}

            <div className={styles.modalFooterDouble}>
              <button onClick={onBack} disabled={submitting} className={styles.modalBackBtn}>
                <ArrowLeftIcon /> Volver
              </button>
              <button onClick={onSubmit} disabled={!canSubmit} className={styles.modalSubmitBtn}>
                <CheckIcon /> {submitting ? 'Guardando...' : 'Crear estrategia'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── ToggleRow ────────────────────────────────────────────────────────────────
// Fila de regla o condición con su interruptor. Mismo interruptor visual
// (36×20, verde al activarse) que el modal de registro de trade.

function ToggleRow({
  item,
  active,
  onToggle,
}: {
  item: BehavioralRuleItem | EntryConditionItem
  active: boolean
  onToggle: () => void
}) {
  return (
    <div className={styles.toggleRow}>
      <span className={styles.toggleRowLabel}>
        {item.label}
        <Tooltip position="above" text={item.description}>
          <InfoSvg />
        </Tooltip>
      </span>
      <button
        type="button"
        onClick={onToggle}
        className={active ? `${styles.toggle} ${styles.toggleActive}` : styles.toggle}
        aria-label={active ? `Desactivar ${item.label}` : `Activar ${item.label}`}
        aria-pressed={active}
      >
        <span className={active ? `${styles.toggleThumb} ${styles.toggleThumbOn}` : styles.toggleThumb} />
      </button>
    </div>
  )
}
