'use client'

import { useEffect, useState } from 'react'
import type { StrategyWithRelations, StrategyConditionItem, StrategyRuleItem } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// StrategyPage — gestión completa de la estrategia operativa del trader.
//
// Es un Client Component porque necesita:
//  - Fetch en mount para cargar la estrategia
//  - Estado local para el formulario de edición
//  - Optimistic updates en los toggles (cambia UI antes de recibir respuesta)
//
// La página tiene dos estados excluyentes:
//  A) Sin estrategia → formulario de creación
//  B) Con estrategia → vista de gestión con edición de campos, toggles, etc.
// ─────────────────────────────────────────────────────────────────────────────

export default function StrategyPage() {
  const [strategy, setStrategy] = useState<StrategyWithRelations | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Cargamos la estrategia al montar el componente.
  // Si recibimos 404 no es un error: el usuario simplemente no tiene estrategia todavía.
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

  if (loading) return <LoadingView />
  if (error) return <ErrorView message={error} />

  return strategy === null ? (
    <CreateStrategyForm onCreated={setStrategy} />
  ) : (
    <ManageStrategyView strategy={strategy} onUpdate={setStrategy} />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LoadingView — estado de carga inicial
// ─────────────────────────────────────────────────────────────────────────────
function LoadingView() {
  return (
    <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
      Cargando estrategia...
    </div>
  )
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
      {message}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateStrategyForm — formulario para el primer acceso (sin estrategia).
//
// Incluye los límites operativos con sus valores por defecto ya rellenados
// para que el trader los vea desde el primer momento y entienda que forman
// parte de la estrategia, no de la intención diaria.
// ─────────────────────────────────────────────────────────────────────────────
function CreateStrategyForm({
  onCreated,
}: {
  onCreated: (s: StrategyWithRelations) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  // Defaults alineados con los @default del schema de Prisma
  const [maxTrades, setMaxTrades] = useState(3)
  const [tradingHoursStart, setTradingHoursStart] = useState('09:00')
  const [tradingHoursEnd, setTradingHoursEnd] = useState('11:30')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    // Validación del rango horario en cliente para feedback inmediato
    if (tradingHoursStart >= tradingHoursEnd) {
      setError('El horario de inicio debe ser anterior al de fin')
      return
    }

    setSubmitting(true)

    const res = await fetch('/api/strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description,
        maxTrades,
        tradingHoursStart,
        tradingHoursEnd,
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Error al crear la estrategia')
      setSubmitting(false)
      return
    }

    // Al recibir la estrategia creada (con todas sus condiciones y reglas)
    // actualizamos el estado del padre para pasar a la vista de gestión.
    const created: StrategyWithRelations = await res.json()
    onCreated(created)
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900">Crea tu estrategia</h1>
      <p className="mt-2 text-sm text-gray-500">
        La estrategia define tu plan de trading. Después de crearla podrás
        activar las condiciones de entrada y reglas conductuales que sigues.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nombre de la estrategia
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Ej: Momentum en apertura NY"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Descripción <span className="text-gray-400">(opcional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Describe brevemente tu enfoque operativo..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {/* Separador visual para los límites operativos */}
        <div className="pt-2 border-t border-gray-200">
          <p className="text-sm font-medium text-gray-700 mb-3">Límites operativos</p>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Máximo de operaciones por sesión
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={maxTrades}
                onChange={(e) => setMaxTrades(parseInt(e.target.value, 10))}
                required
                className="w-32 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hora de inicio
                </label>
                <input
                  type="time"
                  value={tradingHoursStart}
                  onChange={(e) => setTradingHoursStart(e.target.value)}
                  required
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hora de fin
                </label>
                <input
                  type="time"
                  value={tradingHoursEnd}
                  onChange={(e) => setTradingHoursEnd(e.target.value)}
                  required
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Creando estrategia...' : 'Crear Estrategia'}
        </button>
      </form>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ManageStrategyView — vista completa de gestión cuando el usuario tiene estrategia
// ─────────────────────────────────────────────────────────────────────────────
function ManageStrategyView({
  strategy,
  onUpdate,
}: {
  strategy: StrategyWithRelations
  onUpdate: (s: StrategyWithRelations) => void
}) {
  // Contadores de ítems activos para el indicador visual
  const activeConditions = strategy.conditions.filter((c) => c.isActive).length
  const activeRules = strategy.rules.filter((r) => r.isActive).length

  // Separamos las reglas por scope para mostrarlas en subsecciones distintas.
  // PER_TRADE: se evalúan en cada operación individual.
  // PER_SESSION: se evalúan una vez al cerrar la sesión completa.
  const perTradeRules = strategy.rules.filter((r) => r.rule.scope === 'PER_TRADE')
  const perSessionRules = strategy.rules.filter((r) => r.rule.scope === 'PER_SESSION')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Mi Estrategia</h1>

      {/* Indicadores de activación */}
      <div className="flex gap-4 text-sm text-gray-500">
        <span>
          <span className="font-semibold text-gray-900">{activeConditions}</span> de{' '}
          {strategy.conditions.length} condiciones activas
        </span>
        <span>·</span>
        <span>
          <span className="font-semibold text-gray-900">{activeRules}</span> de{' '}
          {strategy.rules.length} reglas activas
        </span>
      </div>

      {/* StrategyInfoSection gestiona tanto la información general como los
          límites operativos en un único componente con un único botón de guardado.
          Se renderizan como dos cards distintos pero comparten estado y acción. */}
      <StrategyInfoSection strategy={strategy} onUpdate={onUpdate} />

      {/* Sección de condiciones de entrada */}
      <section className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">
          Condiciones de Entrada
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Activa las condiciones que deben cumplirse para que una entrada sea válida.
        </p>
        <div className="divide-y divide-gray-100">
          {strategy.conditions.map((sc) => (
            <ConditionRow
              key={sc.id}
              item={sc}
              onToggle={(updated) => {
                // Reemplazamos el ítem actualizado en la lista local
                onUpdate({
                  ...strategy,
                  conditions: strategy.conditions.map((c) =>
                    c.id === updated.id ? updated : c,
                  ),
                })
              }}
            />
          ))}
        </div>
      </section>

      {/* Sección de reglas conductuales */}
      <section className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">
          Reglas Conductuales
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Activa las reglas de comportamiento que te comprometes a seguir durante
          tus sesiones de trading.
        </p>

        {/* Reglas por operación */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">
            Por Operación
          </p>
          <div className="divide-y divide-gray-100">
            {perTradeRules.map((sr) => (
              <RuleRow
                key={sr.id}
                item={sr}
                onToggle={(updated) => {
                  onUpdate({
                    ...strategy,
                    rules: strategy.rules.map((r) =>
                      r.id === updated.id ? updated : r,
                    ),
                  })
                }}
              />
            ))}
          </div>
        </div>

        {/* Reglas por sesión */}
        <div>
          <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2">
            Por Sesión
          </p>
          <div className="divide-y divide-gray-100">
            {perSessionRules.map((sr) => (
              <RuleRow
                key={sr.id}
                item={sr}
                onToggle={(updated) => {
                  onUpdate({
                    ...strategy,
                    rules: strategy.rules.map((r) =>
                      r.id === updated.id ? updated : r,
                    ),
                  })
                }}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// StrategyInfoSection — edición de la información general y los límites operativos.
//
// Gestiona ambos grupos de campos en un único componente con un único botón
// de guardado. Aunque se renderizan como dos tarjetas visualmente distintas,
// comparten el mismo estado local y la misma llamada PUT para garantizar
// consistencia: el trader no puede guardar solo el nombre sin los límites,
// evitando estados parciales contradictorios.
// ─────────────────────────────────────────────────────────────────────────────
function StrategyInfoSection({
  strategy,
  onUpdate,
}: {
  strategy: StrategyWithRelations
  onUpdate: (s: StrategyWithRelations) => void
}) {
  // Estado local para todos los campos editables de la estrategia
  const [name, setName] = useState(strategy.name)
  const [description, setDescription] = useState(strategy.description ?? '')
  const [maxTrades, setMaxTrades] = useState(strategy.maxTrades)
  const [tradingHoursStart, setTradingHoursStart] = useState(strategy.tradingHoursStart)
  const [tradingHoursEnd, setTradingHoursEnd] = useState(strategy.tradingHoursEnd)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)

  // Detectamos si hay cambios sin guardar comparando el estado local con
  // los valores que vienen de la API (prop strategy).
  const hasChanges =
    name !== strategy.name ||
    description !== (strategy.description ?? '') ||
    maxTrades !== strategy.maxTrades ||
    tradingHoursStart !== strategy.tradingHoursStart ||
    tradingHoursEnd !== strategy.tradingHoursEnd

  async function handleSave() {
    if (!name.trim()) return

    // Validación del rango horario en cliente para dar feedback inmediato
    // sin necesitar esperar la respuesta del servidor.
    if (tradingHoursStart >= tradingHoursEnd) {
      setSaveError('El horario de inicio debe ser anterior al de fin')
      return
    }

    setSaving(true)
    setSaveError('')
    setSaved(false)

    // Enviamos siempre todos los campos (no solo los que cambiaron) para
    // simplificar la lógica. El API acepta actualizaciones parciales pero
    // aquí optamos por enviar el estado completo del formulario.
    const res = await fetch('/api/strategy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description,
        maxTrades,
        tradingHoursStart,
        tradingHoursEnd,
      }),
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
    setSaved(true)
    // Ocultamos el mensaje de confirmación tras 2 segundos
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <>
      {/* ── Tarjeta 1: Información general ──────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Información general
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descripción <span className="text-gray-400">(opcional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>
      </section>

      {/* ── Tarjeta 2: Límites operativos + botón de guardado ───────────────── */}
      <section className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">
          Límites Operativos
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Estos límites se aplicarán automáticamente a cada sesión de trading.
          Definirlos aquí (y no en cada sesión) refuerza la consistencia operativa.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Máximo de operaciones por sesión
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={maxTrades}
              onChange={(e) => setMaxTrades(parseInt(e.target.value, 10))}
              className="w-32 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Horario de inicio
              </label>
              <input
                type="time"
                value={tradingHoursStart}
                onChange={(e) => setTradingHoursStart(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Horario de fin
              </label>
              <input
                type="time"
                value={tradingHoursEnd}
                onChange={(e) => setTradingHoursEnd(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* El botón guarda TODOS los campos (info + límites) en una sola petición */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving || !name.trim()}
              className="py-1.5 px-4 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
            {saved && (
              <span className="text-sm text-green-600">¡Guardado correctamente!</span>
            )}
            {saveError && (
              <span className="text-sm text-red-600">{saveError}</span>
            )}
          </div>
        </div>
      </section>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Toggle — componente de interruptor visual reutilizado por condiciones y reglas
// ─────────────────────────────────────────────────────────────────────────────
function Toggle({
  isActive,
  onToggle,
}: {
  isActive: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isActive ? 'Desactivar' : 'Activar'}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
        isActive ? 'bg-green-500' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          isActive ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ConditionRow — fila de una condición de entrada con su toggle
// ─────────────────────────────────────────────────────────────────────────────
function ConditionRow({
  item,
  onToggle,
}: {
  item: StrategyConditionItem
  onToggle: (updated: StrategyConditionItem) => void
}) {
  const [pending, setPending] = useState(false)
  // Estado local que refleja el valor optimista (antes de confirmación de la API)
  const [isActive, setIsActive] = useState(item.isActive)

  async function handleToggle() {
    if (pending) return
    setPending(true)

    // Aplicamos el cambio de forma optimista en la UI para que el feedback
    // sea instantáneo. Si la API falla, revertimos.
    const next = !isActive
    setIsActive(next)

    const res = await fetch(`/api/strategy/conditions/${item.id}`, {
      method: 'PATCH',
    })

    if (!res.ok) {
      // Revertimos el optimismo si algo salió mal
      setIsActive(!next)
      setPending(false)
      return
    }

    const updated = await res.json()
    // Notificamos al padre con el valor confirmado por la API
    onToggle({ ...item, isActive: updated.isActive })
    setPending(false)
  }

  return (
    <div className="flex items-start justify-between py-3 gap-4">
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>
          {item.condition.label}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">{item.condition.description}</p>
      </div>
      <Toggle isActive={isActive} onToggle={handleToggle} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RuleRow — fila de una regla conductual con badge de scope y toggle
// ─────────────────────────────────────────────────────────────────────────────
function RuleRow({
  item,
  onToggle,
}: {
  item: StrategyRuleItem
  onToggle: (updated: StrategyRuleItem) => void
}) {
  const [pending, setPending] = useState(false)
  const [isActive, setIsActive] = useState(item.isActive)

  // Badge visual para distinguir el alcance de la regla
  const scopeBadge =
    item.rule.scope === 'PER_TRADE' ? (
      <span className="inline-block text-xs font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
        Operación
      </span>
    ) : (
      <span className="inline-block text-xs font-medium px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
        Sesión
      </span>
    )

  async function handleToggle() {
    if (pending) return
    setPending(true)

    const next = !isActive
    setIsActive(next)

    const res = await fetch(`/api/strategy/rules/${item.id}`, {
      method: 'PATCH',
    })

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
    <div className="flex items-start justify-between py-3 gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-medium ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>
            {item.rule.label}
          </p>
          {scopeBadge}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">{item.rule.description}</p>
      </div>
      <Toggle isActive={isActive} onToggle={handleToggle} />
    </div>
  )
}
