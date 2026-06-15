import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getServerSession, authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { EMOTIONAL_STATE_LABELS } from '@/types'
import type { EmotionalState } from '@/types'
import styles from './page.module.css'

// ─────────────────────────────────────────────────────────────────────────────
// /session/[id] — Página de resultados de sesión cerrada.
//
// Es un Server Component: no hay interactividad, solo lectura y análisis.
// Consulta la base de datos directamente para evitar el round-trip de la API.
//
// Esta página implementa la fase de REFLEXIÓN del flujo de trading:
//   1. Ver el ICO (resultado de la disciplina operativa)
//   2. Entender cómo se calculó (fórmula con números reales)
//   3. Analizar el desglose de cumplimiento por condición/regla
//   4. Recibir feedback textual para mejorar en la siguiente sesión
//
// El ICO mide disciplina, no resultados financieros. Un trader puede perder
// dinero y tener ICO 100% si siguió su estrategia exactamente.
// ─────────────────────────────────────────────────────────────────────────────

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const authSession = await getServerSession(authOptions)
  if (!authSession?.user?.id) redirect('/login')

  // Cargamos la sesión con todos sus datos en una sola query anidada.
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

  // Verificación de propiedad: solo el dueño puede ver sus resultados.
  if (sessionData.userId !== authSession.user.id) {
    return (
      <div className={styles.unauthorized}>
        No tienes permiso para ver esta sesión.
      </div>
    )
  }

  // Si la sesión está abierta, redirigir a la interfaz de trading activo.
  if (sessionData.status === 'OPEN') redirect('/session/active')

  // Cargamos la estrategia con sus condiciones y reglas para el desglose.
  // Usamos la estrategia actual del usuario (no hay snapshot histórico en el MVP).
  // Incluimos TODOS los registros (no solo activos) para detectar posibles cambios.
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

  // ── Cálculo de componentes del ICO para mostrar la fórmula ──────────────
  // Replicamos el cálculo del servidor para mostrar al trader los números
  // exactos, no solo el resultado final. La transparencia del cálculo es
  // fundamental para que el trader confíe en el sistema y aprenda de él.

  const Ts = sessionData.trades.length
  const activeConditions = strategy?.conditions.filter((c) => c.isActive) ?? []
  const activePerTradeRules = strategy?.rules.filter(
    (r) => r.isActive && r.rule.scope === 'PER_TRADE',
  ) ?? []
  const activePerSessionRules = strategy?.rules.filter(
    (r) => r.isActive && r.rule.scope === 'PER_SESSION',
  ) ?? []

  const C_activas = activeConditions.length
  const R_trade   = activePerTradeRules.length
  const R_session = activePerSessionRules.length

  const Rs = Ts * C_activas + Ts * R_trade + R_session
  const Vs =
    sessionData.trades.reduce((sum, t) => sum + t.violations.length, 0) +
    sessionData.violations.length

  const icoDecimal = sessionData.icoScore ?? 1
  const icoPercent = Math.round(icoDecimal * 100)

  // Calidad del ICO para el color y la etiqueta cualitativa.
  const icoQuality =
    icoPercent >= 85 ? 'high' : icoPercent >= 70 ? 'medium' : 'low'

  const icoScoreClass = {
    high:   styles.icoHigh,
    medium: styles.icoMedium,
    low:    styles.icoLow,
  }[icoQuality]

  const icoBarClass = {
    high:   styles.icoBarHigh,
    medium: styles.icoBarMedium,
    low:    styles.icoBarLow,
  }[icoQuality]

  const icoLabel = {
    high:   'Alta Coherencia',
    medium: 'Coherencia Moderada',
    low:    'Baja Coherencia',
  }[icoQuality]

  // ── Análisis de violaciones para el desglose ─────────────────────────────
  // Para cada condición/regla activa, calculamos en cuántos trades fue violada.
  // Esto permite identificar patrones: si una condición se viola siempre, quizás
  // el trader no la entiende bien o no aplica a su metodología real.

  const conditionViolationCount = new Map<string, number>()
  const ruleViolationCount = new Map<string, number>()

  for (const trade of sessionData.trades) {
    for (const v of trade.violations) {
      if (v.type === 'CONDITION_VIOLATION' && v.conditionId) {
        conditionViolationCount.set(
          v.conditionId,
          (conditionViolationCount.get(v.conditionId) ?? 0) + 1,
        )
      } else if (v.type === 'RULE_VIOLATION' && v.ruleId) {
        ruleViolationCount.set(
          v.ruleId,
          (ruleViolationCount.get(v.ruleId) ?? 0) + 1,
        )
      }
    }
  }

  // Buscamos la condición/regla más problemática (violada en >50% de los trades).
  // Si la encontramos, lo mencionamos en el feedback de forma específica.
  let mostViolatedLabel: string | null = null

  if (Ts > 0) {
    for (const sc of activeConditions) {
      const count = conditionViolationCount.get(sc.conditionId) ?? 0
      if (count > Ts / 2) {
        mostViolatedLabel = sc.condition.label
        break
      }
    }

    if (!mostViolatedLabel) {
      for (const sr of activePerTradeRules) {
        const count = ruleViolationCount.get(sr.ruleId) ?? 0
        if (count > Ts / 2) {
          mostViolatedLabel = sr.rule.label
          break
        }
      }
    }
  }

  // ── Generación del feedback textual ─────────────────────────────────────
  // Mensajes directos y accionables, no genéricos. El objetivo es que el
  // trader salga de esta página con algo concreto en lo que enfocarse.

  const emotionInfo =
    EMOTIONAL_STATE_LABELS[sessionData.intention.emotionalState as EmotionalState]

  return (
    <div className={styles.page}>

      {/* ── Puntuación ICO ─────────────────────────────────────────────── */}
      <div className={styles.icoCard}>
        <p className={styles.icoCardLabel}>
          Índice de Coherencia Operativa
        </p>

        {/* El ICO es el protagonista visual de la página */}
        <p className={`${styles.icoScore} ${icoScoreClass}`}>{icoPercent}%</p>

        <p className={`${styles.icoQualityLabel} ${icoScoreClass}`}>{icoLabel}</p>

        {/* Barra de progreso */}
        <div className={styles.icoProgressBar}>
          <div
            className={`${styles.icoProgressFill} ${icoBarClass}`}
            style={{ width: `${icoPercent}%` }}
          />
        </div>

        {/* Fórmula con los números reales de esta sesión */}
        <div className={styles.icoFormula}>
          ICO = 1 − (Vs/Rs) = 1 − ({Vs}/{Rs === 0 ? '0' : Rs}) ={' '}
          <span className={icoScoreClass}>{icoPercent}%</span>
        </div>
      </div>

      {/* ── Resumen de la sesión ────────────────────────────────────────── */}
      <section className={styles.summaryCard}>
        <h2 className={styles.sectionLabel}>
          Resumen
        </h2>

        <div className={styles.summaryGrid}>
          <div>
            <p className={styles.summaryItemLabel}>Fecha</p>
            <p className={styles.summaryItemValue}>
              {new Date(sessionData.date).toLocaleDateString('es-ES', {
                weekday: 'short',
                day: 'numeric',
                month: 'long',
                timeZone: 'UTC',
              })}
            </p>
          </div>
          <div>
            <p className={styles.summaryItemLabel}>Horario</p>
            <p className={styles.summaryItemValue}>
              {sessionData.intention.tradingHoursStart} –{' '}
              {sessionData.intention.tradingHoursEnd}
            </p>
          </div>
          <div>
            <p className={styles.summaryItemLabel}>Estado emocional</p>
            <p className={styles.summaryItemValue}>
              {emotionInfo.emoji} {emotionInfo.label}
            </p>
          </div>
          <div>
            <p className={styles.summaryItemLabel}>Operaciones</p>
            <p className={styles.summaryItemValue}>
              {Ts} de {sessionData.intention.maxTrades} máx.
            </p>
          </div>
          <div>
            <p className={styles.summaryItemLabel}>Violaciones totales</p>
            <p className={Vs === 0 ? styles.icoHigh : styles.icoLow}>{Vs}</p>
          </div>
          {sessionData.closedAt && (
            <div>
              <p className={styles.summaryItemLabel}>Cerrada a las</p>
              <p className={styles.summaryItemValue}>
                {new Date(sessionData.closedAt).toLocaleTimeString('es-ES', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── Desglose de cumplimiento ────────────────────────────────────── */}
      {(activeConditions.length > 0 || activePerTradeRules.length > 0 || activePerSessionRules.length > 0) && (
        <section className={styles.breakdownSection}>
          <h2 className={styles.sectionLabel}>
            Desglose de cumplimiento
          </h2>

          {/* Condiciones de entrada */}
          {activeConditions.length > 0 && (
            <div className={styles.breakdownCard}>
              <h3 className={styles.breakdownTitle}>Condiciones de entrada</h3>
              <div className={styles.breakdownList}>
                {activeConditions.map((sc) => {
                  const count = conditionViolationCount.get(sc.conditionId) ?? 0
                  const complied = Ts - count
                  const isProblematic = Ts > 0 && count > Ts / 2

                  return (
                    <div key={sc.id} className={styles.breakdownRow}>
                      <span className={
                        count === 0 ? styles.dotGreen
                        : isProblematic ? styles.dotRed
                        : styles.dotAmber
                      } />
                      <span className={styles.breakdownLabel}>
                        {sc.condition.label}
                      </span>
                      {Ts > 0 ? (
                        <span className={styles.breakdownStat}>
                          <span className={styles.statGreen}>{complied} ✓</span>
                          {count > 0 && (
                            <>
                              {' / '}
                              <span className={styles.statRed}>{count} ✗</span>
                            </>
                          )}
                        </span>
                      ) : (
                        <span className={styles.breakdownEmpty}>Sin trades</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Reglas conductuales PER_TRADE */}
          {activePerTradeRules.length > 0 && (
            <div className={styles.breakdownCard}>
              <h3 className={styles.breakdownTitle}>
                Reglas por operación
              </h3>
              <div className={styles.breakdownList}>
                {activePerTradeRules.map((sr) => {
                  const count = ruleViolationCount.get(sr.ruleId) ?? 0
                  const complied = Ts - count
                  const isProblematic = Ts > 0 && count > Ts / 2

                  return (
                    <div key={sr.id} className={styles.breakdownRow}>
                      <span className={
                        count === 0 ? styles.dotGreen
                        : isProblematic ? styles.dotRed
                        : styles.dotAmber
                      } />
                      <span className={styles.breakdownLabel}>
                        {sr.rule.label}
                      </span>
                      {Ts > 0 ? (
                        <span className={styles.breakdownStat}>
                          <span className={styles.statGreen}>{complied} ✓</span>
                          {count > 0 && (
                            <>
                              {' / '}
                              <span className={styles.statRed}>{count} ✗</span>
                            </>
                          )}
                        </span>
                      ) : (
                        <span className={styles.breakdownEmpty}>Sin trades</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Reglas de sesión PER_SESSION */}
          {activePerSessionRules.length > 0 && (
            <div className={styles.breakdownCard}>
              <h3 className={styles.breakdownTitle}>Reglas de sesión</h3>
              <div className={styles.breakdownList}>
                {activePerSessionRules.map((sr) => {
                  // Verificamos si hay una SessionViolation con este ruleId
                  const wasViolated = sessionData.violations.some(
                    (v) => v.ruleId === sr.ruleId,
                  )

                  return (
                    <div key={sr.id} className={styles.breakdownRow}>
                      <span className={wasViolated ? styles.dotRed : styles.dotGreen} />
                      <span className={styles.breakdownLabel}>
                        {sr.rule.label}
                      </span>
                      <span className={wasViolated ? styles.statRed : styles.statGreen}>
                        {wasViolated ? '✗ Violada' : '✓ Cumplida'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Feedback textual ────────────────────────────────────────────── */}
      <section className={styles.reflectionCard}>
        <h2 className={styles.sectionLabel}>
          Reflexión
        </h2>

        <div className={styles.reflectionContent}>
          {/* Mensaje principal basado en el ICO */}
          {Vs === 0 ? (
            <p className={styles.reflectionPerfect}>
              Sesión perfecta. Ejecutaste tu plan exactamente como lo definiste.
            </p>
          ) : icoPercent >= 85 ? (
            <p>Buena disciplina hoy. Mantén la consistencia.</p>
          ) : icoPercent >= 70 ? (
            <p>
              Coherencia moderada. Revisa las reglas que te costó más cumplir
              y reflexiona sobre qué situaciones las desencadenaron.
            </p>
          ) : (
            <p>
              Tu coherencia fue baja esta sesión. Reflexiona sobre qué
              desviaciones se repitieron y si el contexto del mercado influyó
              en tu comportamiento.
            </p>
          )}

          {/* Mensaje específico si hay una regla/condición muy problemática */}
          {mostViolatedLabel && (
            <p className={styles.reflectionWarning}>
              La regla <span className={styles.reflectionHighlight}>&quot;{mostViolatedLabel}&quot;</span> fue
              la más difícil de cumplir hoy. Considera si necesita atención especial en la
              próxima sesión.
            </p>
          )}

          {/* Correlación con el estado emocional (reflexión adicional) */}
          {icoPercent < 70 && (
            <p className={styles.reflectionEmotion}>
              Estado emocional declarado: {emotionInfo.emoji} {emotionInfo.label}.
              ¿Crees que influyó en tu disciplina operativa?
            </p>
          )}
        </div>
      </section>

      {/* ── Navegación ──────────────────────────────────────────────────── */}
      <div className={styles.navActions}>
        <Link href="/dashboard" className={styles.navPrimary}>
          Volver al Dashboard
        </Link>
        <Link href="/history" className={styles.navSecondary}>
          Historial
        </Link>
      </div>
    </div>
  )
}
