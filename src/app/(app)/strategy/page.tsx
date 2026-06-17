// Página de Estrategia — permite crear, ver y editar la estrategia de trading.
//
// Estructura de componentes:
//   StrategyPage          → controlador principal: fetch + routing por estado
//   ├─ LoadingView        → spinner mientras carga
//   ├─ ErrorView          → mensaje de error
//   ├─ CreateStrategyForm → formulario de creación (si no existe estrategia)
//   └─ ManageStrategyView → vista principal cuando ya existe
//       ├─ StrategyReadMode  → lectura (info + límites + botón editar)
//       ├─ StrategyEditMode  → edición inline (inputs + guardar/cancelar)
//       ├─ RuleRow[]         → filas de reglas conductuales con toggle
//       └─ ConditionRow[]    → filas de condiciones de entrada con toggle

'use client'

import { useEffect, useRef, useState } from 'react'
import type { StrategyWithRelations, StrategyConditionItem, StrategyRuleItem } from '@/types'
import { capitalize } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'
import { EditIcon, CheckIcon, CancelIcon, InfoIcon, LockIcon } from '@/components/icons'
import styles from './page.module.css'

// ── Helpers de formato de fecha ──────────────────────────────────────────────
// formatCreatedDate → "18 de mayo de 2026" (para la fecha de creación)
// getTodayDisplay   → "Domingo, 18 de mayo de 2026" (para el header)

function formatCreatedDate(dateStr: string | Date): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function getTodayDisplay(): string {
  return capitalize(
    new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
  )
}

// ── StrategyPage ─────────────────────────────────────────────────────────────
// Componente principal de la página. Hace el fetch a GET /api/strategy y
// decide qué mostrar según el resultado:
//   - 404 (null)  → CreateStrategyForm   (el usuario aún no tiene estrategia)
//   - 200 (data)  → ManageStrategyView   (ya tiene estrategia, puede verla/editarla)
//   - error       → ErrorView
// El state "strategy" es la fuente de verdad; los hijos la actualizan
// vía onCreated / onUpdate para que todo se re-renderice sin refetch.

export default function StrategyPage() {
  const [strategy, setStrategy] = useState<StrategyWithRelations | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasOpenSession, setHasOpenSession] = useState(false)

  useEffect(() => {
    fetch('/api/strategy')
      .then(async (res) => {
        if (res.status === 404) return null
        if (!res.ok) throw new Error('Error al cargar la estrategia')
        return res.json()
      })
      .then((data) => setStrategy(data))
      .catch(() => setError('No se pudo cargar la estrategia. Recarga la página.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/intention')
      .then(async (res) => {
        if (!res.ok) return null
        return res.json()
      })
      .then((data) => {
        if (data?.session?.status === 'OPEN') {
          setHasOpenSession(true)
        }
      })
      .catch(() => { /* no bloquea la página si falla */ })
  }, [])

  if (loading) return <LoadingView />
  if (error) return <ErrorView message={error} />

  return strategy === null ? (
    <CreateStrategyForm onCreated={setStrategy} />
  ) : (
    <ManageStrategyView strategy={strategy} onUpdate={setStrategy} hasOpenSession={hasOpenSession} />
  )
}

// ── Loading / Error ──────────────────────────────────────────────────────────
// Vistas mínimas para los estados de carga y error.

function LoadingView() {
  return <div className={styles.loadingState}>Cargando estrategia...</div>
}

function ErrorView({ message }: { message: string }) {
  return <div className={styles.errorState}>{message}</div>
}

// ── CreateStrategyForm ───────────────────────────────────────────────────────
// Formulario que aparece solo si el usuario no tiene estrategia (404).
// Campos: nombre, descripción (opcional), maxTrades, horario inicio/fin.
// Al hacer POST /api/strategy con éxito, llama a onCreated para pasar
// directamente a ManageStrategyView sin recargar.

function CreateStrategyForm({
  onCreated,
}: {
  onCreated: (s: StrategyWithRelations) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [maxTrades, setMaxTrades] = useState(3)
  const [tradingHoursStart, setTradingHoursStart] = useState('09:00')
  const [tradingHoursEnd, setTradingHoursEnd] = useState('11:30')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (tradingHoursStart >= tradingHoursEnd) {
      setError('El horario de inicio debe ser anterior al de fin')
      return
    }

    setSubmitting(true)

    const res = await fetch('/api/strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, maxTrades, tradingHoursStart, tradingHoursEnd }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Error al crear la estrategia')
      setSubmitting(false)
      return
    }

    const created: StrategyWithRelations = await res.json()
    onCreated(created)
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Estrategia</h1>
      </div>

      <div className={`card ${styles.createForm}`}>
        <h3 className={styles.createHeading}>Crea tu estrategia</h3>
        <p className={styles.createSubheading}>
          La estrategia define tu plan de trading. Después de crearla podrás
          activar las condiciones de entrada y reglas conductuales que sigues.
        </p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Nombre de la estrategia</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Ej: Momentum en apertura NY"
              className={styles.input}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              Descripción <span className={styles.optional}>(opcional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe brevemente tu enfoque operativo..."
              className={styles.textarea}
            />
          </div>

          <div className={styles.limitsSection}>
            <h3 className={styles.limitsSectionTitle}>Límites operativos</h3>

            <div className={styles.limitsFields}>
              <div className={styles.field}>
                <label className={styles.label}>Máximo de operaciones por sesión</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={maxTrades}
                  onChange={(e) => setMaxTrades(parseInt(e.target.value, 10))}
                  required
                  className={styles.inputSmall}
                />
              </div>

              <div className={styles.timeRow}>
                <div className={styles.field}>
                  <label className={styles.label}>Hora de inicio</label>
                  <input
                    type="time"
                    value={tradingHoursStart}
                    onChange={(e) => setTradingHoursStart(e.target.value)}
                    required
                    className={styles.inputTime}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Hora de fin</label>
                  <input
                    type="time"
                    value={tradingHoursEnd}
                    onChange={(e) => setTradingHoursEnd(e.target.value)}
                    required
                    className={styles.inputTime}
                  />
                </div>
              </div>
            </div>
          </div>

          {error && <p className={styles.errorText}>{error}</p>}

          <button type="submit" disabled={submitting} className={styles.submitBtn}>
            {submitting ? 'Creando estrategia...' : 'Crear Estrategia'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── ManageStrategyView ───────────────────────────────────────────────────────
// Vista principal cuando la estrategia ya existe. Tiene tres bloques:
//
// 1. Header        → título "Estrategia" + fecha de hoy
// 2. Strategy card → alterna entre StrategyReadMode y StrategyEditMode
//                    según el state "editing"
// 3. Rules row     → dos cards lado a lado:
//    - Reglas conductuales (separadas por scope: PER_TRADE / PER_SESSION)
//    - Condiciones de entrada
//    Cada fila tiene un Toggle que hace PATCH para activar/desactivar.

function ManageStrategyView({
  strategy,
  onUpdate,
  hasOpenSession,
}: {
  strategy: StrategyWithRelations
  onUpdate: (s: StrategyWithRelations) => void
  hasOpenSession: boolean
}) {
  const [editing, setEditing] = useState(false)
  const activeConditions = strategy.conditions.filter((c) => c.isActive).length
  const activeRules = strategy.rules.filter((r) => r.isActive).length
  const perTradeRules = strategy.rules.filter((r) => r.rule.scope === 'PER_TRADE')
  const perSessionRules = strategy.rules.filter((r) => r.rule.scope === 'PER_SESSION')
  const dateDisplay = getTodayDisplay()

  return (
    <div className={styles.page}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <h1>Estrategia</h1>
        <span className={styles.date}>{dateDisplay}</span>
      </div>

      {/* ── Lock banner ─────────────────────────────────────────────────── */}
      {hasOpenSession && (
        <div className={styles.lockBanner}>
          <span className={styles.lockBannerIcon}><LockIcon /></span>
          <p className={styles.lockBannerText}>
            Hay una sesión en curso. La estrategia no puede modificarse hasta que la cierres.
          </p>
        </div>
      )}

      {/* ── Strategy card ───────────────────────────────────────────────── */}
      <div className={`card ${styles.strategyCard}`}>
        {editing ? (
          <StrategyEditMode
            strategy={strategy}
            onUpdate={onUpdate}
            onCancel={() => setEditing(false)}
            onSaved={() => setEditing(false)}
          />
        ) : (
          <StrategyReadMode
            strategy={strategy}
            onEdit={() => setEditing(true)}
            locked={hasOpenSession}
          />
        )}
      </div>

      {/* ── Rules + Conditions row ──────────────────────────────────────── */}
      <div className={styles.rulesRow}>

        {/* Behavioral Rules */}
        <div className={`card ${styles.rulesCard}`}>
          <h3 className={styles.cardTitle}>
            Reglas Conductuales
            <Tooltip text="Compromisos de disciplina que te propones cumplir durante la operativa. Se evalúan por operación o por sesión según su alcance.">
              <InfoIcon />
            </Tooltip>
          </h3>
          <p className={styles.cardCount}>
            <strong>{activeRules}</strong> reglas activas de {strategy.rules.length}
          </p>

          <div className={styles.cardDivider} />

          <div className={styles.itemList}>
            {perTradeRules.length > 0 && (
              <>
                <h3 className={styles.ruleGroupLabel}>Por Operación</h3>
                {perTradeRules.map((sr) => (
                  <RuleRow
                    key={sr.id}
                    item={sr}
                    locked={hasOpenSession}
                    onToggle={(updated) => {
                      onUpdate({
                        ...strategy,
                        rules: strategy.rules.map((r) => r.id === updated.id ? updated : r),
                      })
                    }}
                  />
                ))}
              </>
            )}

            {perSessionRules.length > 0 && (
              <>
                <h3 className={styles.ruleGroupLabel}>Por Sesión</h3>
                {perSessionRules.map((sr) => (
                  <RuleRow
                    key={sr.id}
                    item={sr}
                    locked={hasOpenSession}
                    onToggle={(updated) => {
                      onUpdate({
                        ...strategy,
                        rules: strategy.rules.map((r) => r.id === updated.id ? updated : r),
                      })
                    }}
                  />
                ))}
              </>
            )}
          </div>
        </div>

        {/* Entry Conditions */}
        <div className={`card ${styles.conditionsCard}`}>
          <h3 className={styles.cardTitle}>
            Condiciones de entrada
            <Tooltip text="Criterios técnicos que deben cumplirse antes de abrir una operación. Violar una condición activa se registra como infracción en el ICO.">
              <InfoIcon />
            </Tooltip>
          </h3>
          <p className={styles.cardCount}>
            <strong>{activeConditions}</strong> condiciones activas de {strategy.conditions.length}
          </p>

          <div className={styles.cardDivider} />

          <div className={styles.itemList}>
            {strategy.conditions.map((sc) => (
              <ConditionRow
                key={sc.id}
                item={sc}
                locked={hasOpenSession}
                onToggle={(updated) => {
                  onUpdate({
                    ...strategy,
                    conditions: strategy.conditions.map((c) => c.id === updated.id ? updated : c),
                  })
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Strategy Read Mode ───────────────────────────────────────────────────────
// Vista de solo lectura dentro de la strategy card. Estructura:
//   strategyContent (flex row)
//   ├─ strategyInfo (lado izquierdo)
//   │   ├─ strategyHeader → "Estrategia activa" + nombre + botón Editar
//   │   ├─ strategyDivider
//   │   ├─ strategyDescription (si existe)
//   │   └─ strategyCreatedAt → "Creada: 18 de mayo de 2026"
//   └─ limitsCard (lado derecho, innerCard)
//       ├─ limitsTitle → "Límites operativos"
//       ├─ limitsMeta  → maxTrades, hora inicio, hora fin
//       └─ limitsFooter

function StrategyReadMode({
  strategy,
  onEdit,
  locked,
}: {
  strategy: StrategyWithRelations
  onEdit: () => void
  locked?: boolean
}) {
  const [descExpanded, setDescExpanded] = useState(false)
  const [descOverflows, setDescOverflows] = useState(false)
  const descRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const el = descRef.current
    if (!el) return
    setDescOverflows(el.scrollHeight > el.clientHeight)
  }, [strategy.description])

  return (
    <div className={styles.strategyContent}>
      <div className={styles.strategyInfo}>
        <div className={styles.strategyHeader}>
          <div>
            <h3 className={styles.strategyActiveLabel}>
              Estrategia activa
              <Tooltip text="Tu plan de trading actual. Define las condiciones de entrada y reglas conductuales que te comprometes a seguir en cada sesión.">
                <InfoIcon />
              </Tooltip>
            </h3>
            <h4 className={styles.strategyName}>{strategy.name}</h4>
          </div>
          {!locked && (
            <button onClick={onEdit} className={`ctaBtn ctaBtnSecondary ${styles.editBtn}`}>
              <EditIcon />
              Editar
            </button>
          )}
        </div>

        <div className={styles.strategyDivider} />

        {strategy.description && (
          <div className={styles.descriptionWrap}>
            <p
              ref={descRef}
              className={`${styles.strategyDescription} ${descExpanded ? '' : styles.descriptionClamped}`}
            >
              {strategy.description}
            </p>
            {(descOverflows || descExpanded) && (
              <button
                type="button"
                onClick={() => setDescExpanded(!descExpanded)}
                className={styles.showMoreBtn}
              >
                {descExpanded ? 'Mostrar menos' : 'Mostrar más'}
              </button>
            )}
          </div>
        )}

        <p className={styles.strategyCreatedAt}>
          Creada: {formatCreatedDate(strategy.createdAt)}
        </p>
      </div>

      <div className={`innerCard ${styles.limitsCard}`}>
        <div className={styles.limitsHeader}>
          <h3 className={styles.limitsTitle}>
            Límites operativos
            <Tooltip text="Máximo de operaciones y horario permitido por sesión. Se aplican automáticamente al abrir una nueva sesión de trading.">
              <InfoIcon />
            </Tooltip>
          </h3>
        </div>

        <div className={styles.limitsDivider} />

        <div className={styles.limitsMeta}>
          <p className={styles.limitsLine}>
            Limite de operaciones: <strong>{strategy.maxTrades} trades</strong>
          </p>
          <p className={styles.limitsLine}>
            Inicio de sesión: <strong>{strategy.tradingHoursStart}</strong>
          </p>
          <p className={styles.limitsLine}>
            Fin de sesión: <strong>{strategy.tradingHoursEnd}</strong>
          </p>
        </div>

        <p className={styles.limitsFooter}>
          Estos límites se aplicarán automáticamente a cada sesión de trading.
        </p>
      </div>
    </div>
  )
}

// ── Strategy Edit Mode ───────────────────────────────────────────────────────
// Misma estructura visual que ReadMode pero con inputs en lugar de texto.
// Se activa cuando el usuario pulsa "Editar" en ReadMode.
//
//   strategyInfo (izquierda) → inputs de nombre y descripción
//   limitsCard (derecha)     → inputs de maxTrades y horarios
//
// handleSave hace PUT /api/strategy. Si tiene éxito, actualiza el state
// global vía onUpdate y cierra el modo edición con onSaved.

function StrategyEditMode({
  strategy,
  onUpdate,
  onCancel,
  onSaved,
}: {
  strategy: StrategyWithRelations
  onUpdate: (s: StrategyWithRelations) => void
  onCancel: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(strategy.name)
  const [description, setDescription] = useState(strategy.description ?? '')
  const [maxTrades, setMaxTrades] = useState(strategy.maxTrades)
  const [tradingHoursStart, setTradingHoursStart] = useState(strategy.tradingHoursStart)
  const [tradingHoursEnd, setTradingHoursEnd] = useState(strategy.tradingHoursEnd)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  async function handleSave() {
    if (!name.trim()) return

    if (tradingHoursStart >= tradingHoursEnd) {
      setSaveError('El horario de inicio debe ser anterior al de fin')
      return
    }

    setSaving(true)
    setSaveError('')

    const res = await fetch('/api/strategy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, maxTrades, tradingHoursStart, tradingHoursEnd }),
    })

    if (!res.ok) {
      const data = await res.json()
      setSaveError(data.error ?? 'Error al guardar')
      setSaving(false)
      return
    }

    const updated: StrategyWithRelations = await res.json()
    onUpdate(updated)
    setSaving(false)
    onSaved()
  }

  return (
    <div className={styles.strategyContent}>
      <div className={styles.strategyInfo}>
        <div className={styles.strategyHeader}>
          <div>
            <h3 className={styles.strategyActiveLabel}>Editando estrategia</h3>
          </div>
          <div className={styles.editActions}>
            <button onClick={onCancel} className={`ctaBtn ctaBtnSecondary ${styles.editBtn}`}>
              <CancelIcon />
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className={`ctaBtn ctaBtnSecondary ${styles.editBtn}`}
            >
              <CheckIcon />
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>

        <div className={styles.strategyDivider} />

        <div className={styles.editFields}>
          <div className={styles.field}>
            <label className={styles.label}>Nombre</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>
              Descripción <span className={styles.optional}>(opcional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={styles.textarea}
            />
          </div>
        </div>

        {saveError && <p className={styles.errorText}>{saveError}</p>}
      </div>

      <div className={`innerCard ${styles.limitsCard}`}>
        <div className={styles.limitsHeader}>
          <h3 className={styles.limitsTitle}>
            Límites operativos
            <Tooltip text="Máximo de operaciones y horario permitido por sesión. Se aplican automáticamente al abrir una nueva sesión de trading.">
              <InfoIcon />
            </Tooltip>
          </h3>
        </div>

        <div className={styles.limitsDivider} />

        <div className={styles.editFields}>
          <div className={styles.field}>
            <label className={styles.label}>Máximo de operaciones</label>
            <input
              type="number"
              min={1}
              step={1}
              value={maxTrades}
              onChange={(e) => setMaxTrades(parseInt(e.target.value, 10))}
              className={styles.inputSmall}
            />
          </div>
          <div className={styles.timeRow}>
            <div className={styles.field}>
              <label className={styles.label}>Inicio de sesión</label>
              <input
                type="time"
                value={tradingHoursStart}
                onChange={(e) => setTradingHoursStart(e.target.value)}
                className={styles.inputTime}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Fin de sesión</label>
              <input
                type="time"
                value={tradingHoursEnd}
                onChange={(e) => setTradingHoursEnd(e.target.value)}
                className={styles.inputTime}
              />
            </div>
          </div>
        </div>

        <p className={styles.limitsFooter}>
          Estos límites se aplicarán automáticamente a cada sesión de trading.
        </p>
      </div>
    </div>
  )
}

// ── Toggle ───────────────────────────────────────────────────────────────────
// Interruptor on/off reutilizable (52×28px).
// Inactivo: fondo glass. Activo: fondo verde (--color-success).
// Solo visual — la lógica de PATCH está en ConditionRow / RuleRow.

function Toggle({
  isActive,
  onToggle,
  disabled,
}: {
  isActive: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  const cls = [
    styles.toggle,
    isActive ? styles.toggleActive : '',
    disabled ? styles.toggleDisabled : '',
  ].filter(Boolean).join(' ')

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onToggle}
      aria-label={isActive ? 'Desactivar' : 'Activar'}
      disabled={disabled}
      className={cls}
    >
      <span className={isActive ? `${styles.toggleThumb} ${styles.toggleThumbOn}` : styles.toggleThumb} />
    </button>
  )
}

// ── ConditionRow ─────────────────────────────────────────────────────────────
// Fila de una condición de entrada (ej: "Tendencia Confirmada").
// Muestra label + descripción + Toggle.
//
// Toggle optimista: cambia el UI inmediatamente y hace PATCH al servidor.
// Si el PATCH falla, revierte el estado local al valor anterior.

function ConditionRow({
  item,
  onToggle,
  locked,
}: {
  item: StrategyConditionItem
  onToggle: (updated: StrategyConditionItem) => void
  locked?: boolean
}) {
  const [pending, setPending] = useState(false)
  const [isActive, setIsActive] = useState(item.isActive)

  async function handleToggle() {
    if (pending || locked) return
    setPending(true)

    const next = !isActive
    setIsActive(next)

    const res = await fetch(`/api/strategy/conditions/${item.id}`, { method: 'PATCH' })

    if (!res.ok) {
      setIsActive(!next)
      setPending(false)
      return
    }

    const updated = await res.json()
    onToggle({ ...item, isActive: updated.isActive })
    setPending(false)
  }

  return (
    <div className={styles.itemRow}>
      <div className={styles.itemInfo}>
        <h3 className={styles.itemLabel}>{item.condition.label}</h3>
        <p className={styles.itemDescription}>{item.condition.description}</p>
      </div>
      <Toggle isActive={isActive} onToggle={handleToggle} disabled={locked} />
    </div>
  )
}

// ── RuleRow ──────────────────────────────────────────────────────────────────
// Igual que ConditionRow pero para reglas conductuales (ej: "Mantener SL").
// Mismo patrón de toggle optimista con PATCH a /api/strategy/rules/[id].

function RuleRow({
  item,
  onToggle,
  locked,
}: {
  item: StrategyRuleItem
  onToggle: (updated: StrategyRuleItem) => void
  locked?: boolean
}) {
  const [pending, setPending] = useState(false)
  const [isActive, setIsActive] = useState(item.isActive)

  async function handleToggle() {
    if (pending || locked) return
    setPending(true)

    const next = !isActive
    setIsActive(next)

    const res = await fetch(`/api/strategy/rules/${item.id}`, { method: 'PATCH' })

    if (!res.ok) {
      setIsActive(!next)
      setPending(false)
      return
    }

    const updated = await res.json()
    onToggle({ ...item, isActive: updated.isActive })
    setPending(false)
  }

  return (
    <div className={styles.itemRow}>
      <div className={styles.itemInfo}>
        <h3 className={styles.itemLabel}>{item.rule.label}</h3>
        <p className={styles.itemDescription}>{item.rule.description}</p>
      </div>
      <Toggle isActive={isActive} onToggle={handleToggle} disabled={locked} />
    </div>
  )
}
