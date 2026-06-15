'use client'

// ─────────────────────────────────────────────────────────────────────────────
// /history — Página de historial y análisis de evolución disciplinaria.
//
// Es el punto de reflexión a largo plazo del flujo de Kosmos:
//   sesión activa → resultados del día → historial semanal
//
// Tres secciones principales:
//
//   A. Resumen semanal: ICO de la semana con comparativa vs semana anterior.
//      Permite ver de un vistazo si la disciplina está mejorando.
//
//   B. Gráfico de evolución: línea de ICO semanal en las últimas 8 semanas.
//      El gráfico premia la consistencia (factor E) además de la media.
//
//   C. Retroalimentación: mensajes generados a partir de los datos reales,
//      no plantillas genéricas. Cada mensaje cita números concretos.
//
//   D. Lista de sesiones: historial cronológico con ICO, trades, violaciones
//      y estado emocional. Clic → /session/[id] para ver el desglose completo.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type {
  HistoryResponse,
  WeeklyHistoryResponse,
  FeedbackResponse,
  SessionHistoryItem,
  WeeklyIcoItem,
  EmotionalState,
} from '@/types'
import { EMOTIONAL_STATE_LABELS } from '@/types'
import styles from './page.module.css'

// Helper: devuelve la clave del módulo CSS según el score ICO
function icoStyleKey(score: number): 'icoHigh' | 'icoMedium' | 'icoLow' {
  const pct = score <= 1 ? score * 100 : score
  if (pct >= 85) return 'icoHigh'
  if (pct >= 70) return 'icoMedium'
  return 'icoLow'
}

export default function HistoryPage() {
  const router = useRouter()

  // ── Estado de los tres bloques de datos ─────────────────────────────────
  const [weekly, setWeekly]     = useState<WeeklyHistoryResponse | null>(null)
  const [feedback, setFeedback] = useState<FeedbackResponse | null>(null)
  const [history, setHistory]   = useState<HistoryResponse | null>(null)
  const [loading, setLoading]   = useState(true)
  const [page, setPage]         = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)

  // ── Carga inicial de los tres endpoints en paralelo ──────────────────────
  useEffect(() => {
    async function loadAll() {
      try {
        const [weeklyRes, feedbackRes, historyRes] = await Promise.all([
          fetch('/api/history/weekly?weeks=8'),
          fetch('/api/history/feedback'),
          fetch('/api/history?page=1&limit=20'),
        ])

        if (weeklyRes.ok)   setWeekly(await weeklyRes.json())
        if (feedbackRes.ok) setFeedback(await feedbackRes.json())
        if (historyRes.ok)  setHistory(await historyRes.json())
      } finally {
        setLoading(false)
      }
    }
    loadAll()
  }, [])

  // ── Cargar más sesiones (paginación) ─────────────────────────────────────
  async function loadMoreSessions() {
    if (!history || page >= history.totalPages || loadingMore) return
    setLoadingMore(true)
    try {
      const nextPage = page + 1
      const res = await fetch(`/api/history?page=${nextPage}&limit=20`)
      if (res.ok) {
        const data: HistoryResponse = await res.json()
        setHistory((prev) => prev
          ? { ...data, sessions: [...prev.sessions, ...data.sessions] }
          : data
        )
        setPage(nextPage)
      }
    } finally {
      setLoadingMore(false)
    }
  }

  // ── Calcular métricas de la semana más reciente con datos ────────────────
  // Buscamos de derecha a izquierda (semanas más recientes primero).
  const weeksWithData = weekly?.weeks.filter((w) => w.icoWeekly !== null) ?? []
  const latestWeek    = weeksWithData[weeksWithData.length - 1] ?? null
  const prevWeek      = weeksWithData[weeksWithData.length - 2] ?? null

  const weekDiff =
    latestWeek?.icoWeekly != null && prevWeek?.icoWeekly != null
      ? latestWeek.icoWeekly - prevWeek.icoWeekly
      : null

  // ── Preparar datos para Recharts ─────────────────────────────────────────
  // Recharts no admite gaps en los datos de una misma línea; para las semanas
  // sin datos usamos `undefined` en lugar de null: Recharts conectará con
  // `connectNulls={false}` por defecto y dejará el gap visual.
  const chartData = weekly?.weeks.map((w) => ({
    weekLabel:  w.weekLabel,
    icoWeekly:  w.icoWeekly !== null ? Math.round(w.icoWeekly * 100) : undefined,
    avgDailyIco: w.avgDailyIco !== null ? Math.round((w.avgDailyIco ?? 0) * 100) : undefined,
    stability:  w.stability !== null ? Math.round((w.stability ?? 0) * 100) : undefined,
    sessions:   w.sessionCount,
    // Guardamos los datos originales para el tooltip
    _raw: w,
  })) ?? []

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <p className={styles.loadingText}>Cargando historial...</p>
      </div>
    )
  }

  const hasAnySessions = (history?.total ?? 0) > 0

  // ── Estado vacío ─────────────────────────────────────────────────────────
  if (!hasAnySessions) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyIcon}>📊</p>
        <h2 className={styles.emptyHeading}>
          Aún no tienes sesiones registradas
        </h2>
        <p className={styles.emptyText}>
          Inicia tu primera sesión desde el Dashboard para empezar a medir
          tu disciplina operativa y ver tu evolución aquí.
        </p>
        <Link href="/dashboard" className={styles.emptyCta}>
          Ir al Dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className={styles.page}>

      {/* ── Cabecera ─────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <h1 className={styles.heading}>Historial</h1>
        <p className={styles.subheading}>
          Evolución de tu disciplina operativa a lo largo del tiempo.
        </p>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          A. RESUMEN SEMANAL
          ════════════════════════════════════════════════════════════════════ */}
      {latestWeek && (
        <section className={styles.summaryCard}>
          <div className={styles.summaryTop}>
            <div>
              <p className={styles.summaryLabel}>
                {latestWeek.weekLabel} · ICO semanal
              </p>
              <div className={styles.summaryScore}>
                <span className={styles[icoStyleKey(latestWeek.icoWeekly ?? 0)]}>
                  {Math.round((latestWeek.icoWeekly ?? 0) * 100)}%
                </span>
                {/* Comparativa con semana anterior */}
                {weekDiff !== null && (
                  <span className={weekDiff >= 0 ? styles.diffPositive : styles.diffNegative}>
                    {weekDiff >= 0 ? '▲' : '▼'} {Math.round(Math.abs(weekDiff) * 100)}%
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Barra de progreso del ICO semanal */}
          <div className={styles.progressBar}>
            <div
              className={styles[icoStyleKey(latestWeek.icoWeekly ?? 0) === 'icoHigh' ? 'progressFill' : icoStyleKey(latestWeek.icoWeekly ?? 0) === 'icoMedium' ? 'progressFillMedium' : 'progressFillLow']}
              style={{ width: `${Math.round((latestWeek.icoWeekly ?? 0) * 100)}%` }}
            />
          </div>

          {/* Mini-indicadores: sesiones, media diaria, estabilidad */}
          <div className={styles.miniStats}>
            <div className={styles.miniStat}>
              <p className={styles.miniStatValue}>{latestWeek.sessionCount}</p>
              <p className={styles.miniStatLabel}>Sesiones</p>
            </div>
            <div className={styles.miniStat}>
              <p className={styles.miniStatValue}>
                {Math.round((latestWeek.avgDailyIco ?? 0) * 100)}%
              </p>
              <p className={styles.miniStatLabel}>Media diaria</p>
            </div>
            <div className={styles.miniStat}>
              <p className={styles.miniStatValue}>
                {Math.round((latestWeek.stability ?? 0) * 100)}%
              </p>
              <p className={styles.miniStatLabel}>Estabilidad</p>
            </div>
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          B. GRÁFICO DE EVOLUCIÓN SEMANAL
          ════════════════════════════════════════════════════════════════════ */}
      {weekly && weeksWithData.length > 0 && (
        <section className={styles.chartCard}>
          <h2 className={styles.chartTitle}>
            Evolución del ICO semanal
          </h2>

          <div className={styles.chartWrapper}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />

                <XAxis
                  dataKey="weekLabel"
                  tick={{ fill: '#71717a', fontSize: 11 }}
                  axisLine={{ stroke: '#3f3f46' }}
                  tickLine={false}
                />

                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: '#71717a', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}%`}
                />

                {/* Líneas de referencia de umbrales cualitativos */}
                <ReferenceLine y={85} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.4} />
                <ReferenceLine y={70} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.4} />

                <Tooltip content={<WeeklyTooltip />} />

                <Line
                  type="monotone"
                  dataKey="icoWeekly"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  dot={{ fill: '#6366f1', r: 4, strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#818cf8' }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Leyenda de umbrales */}
          <div className={styles.chartLegend}>
            <span className={styles.legendItem}>
              <span className={styles.legendLineGreen} />
              Alta coherencia ≥ 85%
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendLineAmber} />
              Coherencia moderada ≥ 70%
            </span>
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          C. RETROALIMENTACIÓN SEMANAL
          ════════════════════════════════════════════════════════════════════ */}
      <section className={styles.feedbackSection}>
        <h2 className={styles.sectionLabel}>
          Retroalimentación
        </h2>

        {feedback && feedback.messages.length > 0 ? (
          <div className={styles.feedbackList}>
            {feedback.messages.map((msg, i) => (
              <FeedbackCard key={i} type={msg.type as 'positive' | 'neutral' | 'warning' | 'info'} text={msg.text} />
            ))}
          </div>
        ) : (
          <div className={styles.feedbackEmpty}>
            <p className={styles.feedbackEmptyText}>
              Necesitas más sesiones para generar retroalimentación.
              ¡Sigue operando con disciplina!
            </p>
          </div>
        )}
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          D. LISTA DE SESIONES
          ════════════════════════════════════════════════════════════════════ */}
      <section className={styles.sessionsSection}>
        <div className={styles.sessionsSectionHeader}>
          <h2 className={styles.sectionLabel}>
            Sesiones pasadas
          </h2>
          {history && (
            <span className={styles.sessionCount}>{history.total} en total</span>
          )}
        </div>

        {history && history.sessions.length > 0 ? (
          <>
            <div className={styles.sessionList}>
              {history.sessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  onClick={() => router.push(`/session/${s.id}`)}
                />
              ))}
            </div>

            {/* Botón "cargar más" si hay más páginas */}
            {page < (history.totalPages ?? 1) && (
              <button
                onClick={loadMoreSessions}
                disabled={loadingMore}
                className={styles.loadMoreBtn}
              >
                {loadingMore ? 'Cargando...' : 'Cargar más sesiones'}
              </button>
            )}
          </>
        ) : (
          <p className={styles.noSessions}>
            No hay sesiones cerradas en el historial.
          </p>
        )}
      </section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// WeeklyTooltip — Tooltip personalizado del gráfico de Recharts.
// Recharts pasa el array `payload` con los datos del punto activo.
// ─────────────────────────────────────────────────────────────────────────────

function WeeklyTooltip({ active, payload }: {
  active?: boolean
  payload?: { payload: { icoWeekly?: number; sessions: number; avgDailyIco?: number; stability?: number; _raw: WeeklyIcoItem } }[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  if (d.icoWeekly == null) return null
  const raw = d._raw

  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipTitle}>{raw.weekLabel}</p>
      <p className={styles.tooltipIco}>ICO semanal: {d.icoWeekly}%</p>
      <p className={styles.tooltipDetail}>Media diaria: {d.avgDailyIco}%</p>
      <p className={styles.tooltipDetail}>Estabilidad: {d.stability}%</p>
      <p className={styles.tooltipSessions}>{d.sessions} {d.sessions === 1 ? 'sesión' : 'sesiones'}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FeedbackCard — Mensaje de retroalimentación con icono y color según tipo.
// El borde lateral de color permite identificar visualmente el tono del mensaje
// sin necesidad de leer el texto completo.
// ─────────────────────────────────────────────────────────────────────────────

const FEEDBACK_ICONS: Record<string, string> = {
  positive: '✅',
  neutral:  '📊',
  warning:  '⚠️',
  info:     'ℹ️',
}

const FEEDBACK_TYPE_CLASSES: Record<string, keyof typeof styles> = {
  positive: 'feedbackPositive',
  neutral:  'feedbackNeutral',
  warning:  'feedbackWarning',
  info:     'feedbackInfo',
}

function FeedbackCard({ type, text }: { type: 'positive' | 'neutral' | 'warning' | 'info'; text: string }) {
  const icon = FEEDBACK_ICONS[type] ?? FEEDBACK_ICONS.info
  const typeClass = FEEDBACK_TYPE_CLASSES[type] ?? FEEDBACK_TYPE_CLASSES.info
  return (
    <div className={`${styles.feedbackCard} ${styles[typeClass as string]}`}>
      <span className={styles.feedbackIcon}>{icon}</span>
      <p className={styles.feedbackText}>{text}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SessionRow — Fila del historial de sesiones.
// Diseñada para ser escaneada rápidamente: el color del ICO es el indicador
// visual primario. El emoji de estado emocional da contexto sin texto extra.
// ─────────────────────────────────────────────────────────────────────────────

function SessionRow({ session, onClick }: { session: SessionHistoryItem; onClick: () => void }) {
  const emotionInfo = EMOTIONAL_STATE_LABELS[session.emotionalState as EmotionalState]
  const icoPercent  = session.icoScore !== null ? Math.round(session.icoScore * 100) : null

  return (
    <button onClick={onClick} className={styles.sessionRow}>
      {/* ICO del día como indicador visual principal */}
      <div className={styles.sessionIco}>
        {icoPercent !== null ? (
          <span className={styles[icoStyleKey(session.icoScore ?? 0)]}>
            {icoPercent}%
          </span>
        ) : (
          <span className={styles.sessionIcoEmpty}>—</span>
        )}
      </div>

      {/* Fecha */}
      <div className={styles.sessionInfo}>
        <p className={styles.sessionDate}>
          {new Date(session.date).toLocaleDateString('es-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          })}
        </p>
        {/* Métricas secundarias */}
        <div className={styles.sessionMeta}>
          <span>{session.tradeCount} {session.tradeCount === 1 ? 'trade' : 'trades'}</span>
          {session.violationCount > 0 && (
            <span className={styles.violationBadge}>{session.violationCount} {session.violationCount === 1 ? 'violación' : 'violaciones'}</span>
          )}
          {session.pnlTotal !== null && (
            <span className={session.pnlTotal >= 0 ? styles.pnlPositive : styles.pnlNegative}>
              {session.pnlTotal >= 0 ? '+' : ''}{session.pnlTotal.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Estado emocional */}
      <div className={styles.sessionEmotion}>
        <span title={emotionInfo.label}>{emotionInfo.emoji}</span>
      </div>

      <span className={styles.sessionArrow}>→</span>
    </button>
  )
}
