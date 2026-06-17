// Página de Intención Diaria — barrera de reflexión previa a operar.
//
// El trader debe revisar su estrategia, declarar su estado emocional
// y confirmar antes de poder abrir una sesión de trading.
//
// Estados posibles al cargar:
//   1. Sin estrategia           → error con enlace a /strategy
//   2. Sin intención hoy        → formulario completo
//   3. Intención sin confirmar  → formulario pre-rellenado (editable)
//   4. Sesión OPEN              → redirect a /session/active
//   5. Sesión CLOSED            → mensaje "sesión completada"
//
// Estructura visual (Figma):
//   header → título + fecha
//   card principal
//   ├─ summaryRow (3 columnas)
//   │   ├─ strategyInfo (texto read-only)
//   │   ├─ innerCard rulesCard (reglas agrupadas por scope)
//   │   └─ innerCard conditionsCard
//   ├─ innerCard emotionSection (5 botones emoji)
//   └─ innerCard notesSection (textarea)
//   footer → texto compromiso + botón confirmar

'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { EmotionalState, TodayIntention, StrategyWithRelations } from '@/types'
import { EMOTIONAL_STATE_LABELS } from '@/types'
import { capitalize } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'
import { InfoIcon, PlayIcon } from '@/components/icons'
import styles from './page.module.css'

// ── Iconos de estado emocional (específicos de esta pantalla) ──────────────
// Cada icono es un smiley estilizado que representa un estado emocional.
// Se renderizan dentro de los botones de selección de emoción.

function NeutralIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 31.667 31.667" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" aria-hidden="true">
      <circle cx="15.833" cy="15.833" r="14.583" />
      <line x1="20.938" y1="11.458" x2="20.938" y2="12.188" strokeLinecap="round" />
      <line x1="10.729" y1="11.458" x2="10.729" y2="12.188" strokeLinecap="round" />
      <line x1="10.729" y1="20.938" x2="20.938" y2="20.938" strokeLinecap="round" />
    </svg>
  )
}

function AnxiousIcon() {
  return (
    <svg width="32" height="32" viewBox="1.3 1.3 32.4 32.4" fill="currentColor" aria-hidden="true">
      <path d="M17.5 1.458c8.86 0 16.042 7.183 16.042 16.042S26.36 33.542 17.5 33.542 1.458 26.36 1.458 17.5 8.64 1.458 17.5 1.458Zm0 2.188a13.854 13.854 0 1 0 0 27.708 13.854 13.854 0 0 0 0-27.708Zm0 14.948c5.085 0 7.197 4.042 7.623 5.75a.875.875 0 0 1-.186.49.875.875 0 0 1-.374.31.875.875 0 0 1-.5.06H10.938a.875.875 0 0 1-1.062-1.066c.427-1.708 2.539-5.544 7.624-5.544Zm0 2.187c-2.603 0-4.13 1.459-4.904 2.735h9.808c-.774-1.276-2.301-2.735-4.904-2.735ZM8.456 11.282a.875.875 0 0 1 1.408-.611l5.833 2.188a.875.875 0 0 1 0 1.647l-5.833 2.188a.875.875 0 0 1-.611-1.647l3.102-1.164-3.102-1.163a.875.875 0 0 1-.797-1.438Zm16.68-.64a.875.875 0 0 1 1.408.64.875.875 0 0 1-.797 1.408l-3.102 1.164 3.102 1.163a.875.875 0 0 1-.611 1.647l-5.834-2.187a.875.875 0 0 1 0-1.647l5.834-2.188Z" />
    </svg>
  )
}

function ConfidentIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32.214 32.214" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="16.107" cy="16.107" r="14.857" />
      <circle cx="10.964" cy="10.964" r="0.571" fill="currentColor" />
      <circle cx="21.25" cy="10.964" r="0.571" fill="currentColor" />
      <path d="M8.107 17.25h16a8 8 0 0 1-16 0Z" />
    </svg>
  )
}

function FrustratedIcon() {
  return (
    <svg width="32" height="32" viewBox="0.8 2 33.5 33.5" fill="currentColor" aria-hidden="true">
      <path d="M34.052 25.438h-2.22a15.75 15.75 0 0 0 1.688-7.432 15.75 15.75 0 0 0-4.174-9.305 15.75 15.75 0 0 0-22.693-.002A15.75 15.75 0 0 0 5.163 25.438H2.948a1.75 1.75 0 0 0-1.792 1.702c-.004.23.038.46.123.674a1.75 1.75 0 0 0 1.611 1.091h8.672a1.156 1.156 0 0 1 0 2.313H10.43a1.156 1.156 0 0 0-1.157 1.415 1.156 1.156 0 0 0 1.133.898h18.461a1.156 1.156 0 0 0 1.036-1.712 1.156 1.156 0 0 0-1.036-.6H20.812a1.156 1.156 0 0 1 0-2.313h1.126a1.156 1.156 0 0 0 1.03-1.69 1.156 1.156 0 0 0-1.03-.623H19.656c-2.158 0-4.421-.835-6.215-2.29-1.958-1.59-3.035-3.653-3.035-5.803 0-.436.034-.87.103-1.3a1.156 1.156 0 0 1 2.094-.662c.095.125.163.27.198.422.054.153.073.314.054.474-.054.32-.08.647-.08.965 0 3.203 3.795 5.781 6.938 5.781h2.231c1.951 0 3.593 1.597 3.548 3.548a3.5 3.5 0 0 1-.033.41.412.412 0 0 0 .578.475h8.129a1.75 1.75 0 0 0 1.69-1.766 1.75 1.75 0 0 0-1.803-1.703ZM18.486 13.522a2.312 2.312 0 1 1-3.462-2.585 2.312 2.312 0 0 1 3.462 2.585Zm6.937 6.938a2.312 2.312 0 1 1-3.462-2.585 2.312 2.312 0 0 1 3.462 2.585Z" />
    </svg>
  )
}

function TiredIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 33.438 33.438" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="16.719" cy="16.719" r="15.469" />
      <path d="M8.469 15.619a4.125 4.125 0 0 0 4.125 0M20.844 15.619a4.125 4.125 0 0 0 4.125 0" />
      <path d="M7.438 11.447a8.25 8.25 0 0 0 5.524-3.66M26.116 11.447a8.25 8.25 0 0 1-5.525-3.66" />
      <path d="M21.883 26.206a.687.687 0 0 0 .336-1.237 7.875 7.875 0 0 0-10.876 0 .687.687 0 0 0 .337 1.237 18.375 18.375 0 0 1 10.203 0Z" />
    </svg>
  )
}

// Mapeo de EmotionalState → componente SVG.
// Separado de EMOTIONAL_STATE_LABELS (que vive en @/types) porque los SVGs
// son específicos de esta página y no se reutilizan en otros componentes.
const EMOTION_ICONS: Record<EmotionalState, React.ReactNode> = {
  NEUTRAL: <NeutralIcon />,
  ANXIOUS: <AnxiousIcon />,
  CONFIDENT: <ConfidentIcon />,
  FRUSTRATED: <FrustratedIcon />,
  TIRED: <TiredIcon />,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getTodayDisplay(): string {
  return capitalize(
    new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
  )
}

// ── SessionNewPage ──────────────────────────────────────────────────────────
// Componente principal. Carga estrategia + intención en paralelo y decide
// qué vista mostrar. El state vive aquí; los handlers mutan y redirigen.

export default function SessionNewPage() {
  const router = useRouter()

  // ── Estado de carga y datos ──────────────────────────────────────────────
  const [loading, setLoading] = useState(true)
  const [redirecting, setRedirecting] = useState(false)
  const [strategy, setStrategy] = useState<StrategyWithRelations | null>(null)
  const [intention, setIntention] = useState<TodayIntention | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ── Estado del formulario ────────────────────────────────────────────────
  const [emotionalState, setEmotionalState] = useState<EmotionalState | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // ── Carga inicial ────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      try {
        const [strategyRes, intentionRes] = await Promise.all([
          fetch('/api/strategy'),
          fetch('/api/intention'),
        ])

        if (!strategyRes.ok) {
          if (strategyRes.status === 404) {
            setError('Debes configurar tu estrategia antes de crear una sesión.')
          } else {
            setError('Error al cargar la estrategia.')
          }
          return
        }

        const strategyData: StrategyWithRelations = await strategyRes.json()
        setStrategy(strategyData)

        if (intentionRes.ok) {
          const intentionData: TodayIntention = await intentionRes.json()
          setIntention(intentionData)

          // Sesión abierta → ir directo al trading
          if (intentionData.confirmedAt && intentionData.session?.status === 'OPEN') {
            setRedirecting(true)
            router.replace('/session/active')
            return
          }

          // Sesión cerrada → ir directo al detalle de la sesión
          if (intentionData.confirmedAt && intentionData.session?.status === 'CLOSED') {
            setRedirecting(true)
            router.replace(`/session/${intentionData.session.id}`)
            return
          }

          // Pre-rellenar campos con la intención existente
          setEmotionalState(intentionData.emotionalState)
          setNotes(intentionData.notes ?? '')
        }
      } catch {
        setError('Error de conexión. Inténtalo de nuevo.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [router])

  // ── Confirmar y abrir sesión ──────────────────────────────────────────
  // Si no hay intención hoy → la crea (POST) y luego confirma.
  // Si ya existe sin confirmar (el usuario volvió a la página) → salta
  // el POST y va directo al confirm. La intención ya confirmada no llega
  // aquí porque el useEffect redirige a /session/active.
  async function handleConfirmAndStart() {
    if (!emotionalState) return

    setSubmitting(true)
    setSubmitError(null)

    try {
      // 1. Crear intención solo si no existe todavía
      if (!intention) {
        const createRes = await fetch('/api/intention', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emotionalState, notes: notes.trim() || null }),
        })

        if (!createRes.ok) {
          const data = await createRes.json()
          setSubmitError(data.error ?? 'Error al crear la intención.')
          return
        }
      }

      // 2. Confirmar y abrir sesión
      const confirmRes = await fetch('/api/intention/confirm', { method: 'POST' })

      if (!confirmRes.ok) {
        const data = await confirmRes.json()
        setSubmitError(data.error ?? 'Error al confirmar la intención.')
        return
      }

      router.push('/session/active')
    } catch {
      setSubmitError('Error de conexión. Inténtalo de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Renders condicionales ───────────────────────────────────────────────

  if (loading || redirecting) {
    return <div className={styles.loadingState} />
  }

  if (error) {
    return (
      <div className={styles.errorState}>
        <p>{error}</p>
        {error.includes('estrategia') && (
          <a href="/strategy" className="ctaBtn ctaBtnPrimary">
            Configurar estrategia
          </a>
        )}
      </div>
    )
  }


  // ── Datos derivados de la estrategia ──────────────────────────────────
  const activeConditions = strategy?.conditions.filter((c) => c.isActive) ?? []
  const activeRules = strategy?.rules.filter((r) => r.isActive) ?? []
  const perSessionRules = activeRules.filter((r) => r.rule.scope === 'PER_SESSION')
  const perTradeRules = activeRules.filter((r) => r.rule.scope === 'PER_TRADE')
  const dateDisplay = getTodayDisplay()

  // ── Formulario principal ──────────────────────────────────────────────

  return (
    <div className={styles.page}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <h1>Intención diaria · Pre-Sesión</h1>
        <span className={styles.date}>{dateDisplay}</span>
      </div>

      {/* ── Card principal ──────────────────────────────────────────────── */}
      <div className={`card ${styles.mainCard}`}>

        {/* ── Resumen: estrategia + reglas + condiciones ────────────────── */}
        <div className={styles.summaryRow}>

          {/* Estrategia info (texto sin sub-card) */}
          <div className={styles.strategyInfo}>
            <h3 className={styles.sectionTitle}>
              Tu estrategia
              <Tooltip text="Estos son los límites y el plan con los que operarás hoy. Vienen directamente de tu estrategia configurada.">
                <InfoIcon />
              </Tooltip>
            </h3>

            <div className={styles.strategyDivider} />

            <div className={styles.strategyMeta}>
              <p className={styles.metaLine}>
                Estrategia: <strong>{strategy?.name}</strong>
              </p>
              <p className={styles.metaLine}>
                Máx. operaciones: <strong>{strategy?.maxTrades} trades</strong>
              </p>
              <p className={styles.metaLine}>
                Inicio de sesión: <strong>{strategy?.tradingHoursStart}</strong>
              </p>
              <p className={styles.metaLine}>
                Fin de sesión: <strong>{strategy?.tradingHoursEnd}</strong>
              </p>
            </div>

            <p className={styles.strategyFooter}>
              Estos límites vienen de tu estrategia.
              Si necesitas cambiarlos, ve a Estrategia.
            </p>
          </div>


          {/* Reglas y Condiciones Activas */}
          <div className={styles.rulesConditionsRow}>

            {/* Reglas activas */}
            <div className={`innerCard ${styles.rulesCard}`}>
              <h3 className={styles.sectionTitle}>
                Reglas activas a seguir
                <Tooltip text="Las reglas conductuales que te comprometes a cumplir durante esta sesión. Se evaluarán al cerrarla.">
                  <InfoIcon />
                </Tooltip>
              </h3>

              <div className={styles.cardDivider} />

              <div className={styles.rulesList}>
                {perSessionRules.length > 0 && (
                  <div className={styles.ruleGroup}>
                    <h4 className={styles.ruleGroupLabel}>Por Sesión</h4>
                    {perSessionRules.map((r) => (
                      <p key={r.id} className={styles.ruleItem}>{r.rule.label}</p>
                    ))}
                  </div>
                )}

                {perTradeRules.length > 0 && (
                  <div className={styles.ruleGroup}>
                    <h4 className={styles.ruleGroupLabel}>Por Operación</h4>
                    {perTradeRules.map((r) => (
                      <p key={r.id} className={styles.ruleItem}>{r.rule.label}</p>
                    ))}
                  </div>
                )}

                {activeRules.length === 0 && (
                  <p className={styles.emptyText}>Sin reglas activas</p>
                )}
              </div>
            </div>

            {/* Condiciones activas */}
            <div className={`innerCard ${styles.conditionsCard}`}>
              <h3 className={styles.sectionTitle}>
                Condiciones activas a seguir
                <Tooltip text="Las condiciones de entrada que deben cumplirse antes de abrir una operación. Violarlas impacta tu ICO.">
                  <InfoIcon />
                </Tooltip>
              </h3>

              <div className={styles.cardDivider} />

              <div className={styles.conditionsList}>
                {activeConditions.map((c) => (
                  <p key={c.id} className={styles.conditionItem}>{c.condition.label}</p>
                ))}

                {activeConditions.length === 0 && (
                  <p className={styles.emptyText}>Sin condiciones activas</p>
                )}
              </div>
            </div>
          </div>
        </div>


        {/* ── Estado emocional ──────────────────────────────────────────── */}
        <div className={`innerCard ${styles.emotionSection}`}>
          <h3 className={styles.sectionTitle}>
            Tu estado emocional · ¿Cómo te sientes hoy?
            <Tooltip text="Se correlaciona con tu rendimiento para identificar patrones. Sé honesto — no hay respuesta correcta.">
              <InfoIcon />
            </Tooltip>
          </h3>

          <div className={styles.emotionGrid}>
            {(Object.entries(EMOTIONAL_STATE_LABELS) as [EmotionalState, { label: string }][]).map(
              ([state, { label }]) => {
                const isSelected = emotionalState === state
                return (
                  <button
                    key={state}
                    type="button"
                    onClick={() => setEmotionalState(state)}
                    className={isSelected
                      ? `${styles.emotionBtn} ${styles.emotionBtnSelected}`
                      : styles.emotionBtn}
                  >
                    <span className={styles.emotionIcon}>{EMOTION_ICONS[state]}</span>
                    <span className={styles.emotionLabel}>{label}</span>
                  </button>
                )
              },
            )}
          </div>
        </div>

        {/* ── Notas opcionales ──────────────────────────────────────────── */}
        <div className={`innerCard ${styles.notesSection}`}>
          <h3 className={styles.sectionTitle}>
            Notas adicionales opcionales
            <Tooltip text="Plan específico del día, niveles clave o cualquier recordatorio antes de operar.">
              <InfoIcon />
            </Tooltip>
          </h3>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="¿Algo que quieras tener presente hoy?..."
            rows={3}
            className={styles.notesTextarea}
          />
        </div>
      </div>

      {/* ── Footer: compromiso + botón ──────────────────────────────────── */}
      <div className={styles.footer}>
        <p className={styles.commitmentText}>
          Al confirmar, te comprometes a respetar tu estrategia, tus reglas
          y tus límites durante toda la sesión.
        </p>

        <button
          onClick={handleConfirmAndStart}
          disabled={!emotionalState || submitting}
          className={`ctaBtn ctaBtnPrimary ${styles.confirmBtn}`}
        >
          <PlayIcon />
          {submitting ? 'Abriendo sesión...' : 'Confirmar y Empezar Sesión'}
        </button>
      </div>

      {submitError && <p className={styles.submitError}>{submitError}</p>}
    </div>
  )
}
