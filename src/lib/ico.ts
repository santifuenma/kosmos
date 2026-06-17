// ─────────────────────────────────────────────────────────────────────────────
// ico.ts — fórmulas del Índice de Coherencia Operativa (ICO).
//
// Centralizamos aquí las dos fórmulas que rigen el producto:
//   - `computeIco`        → ICO diario al cerrar una sesión.
//   - `computeWeeklyIco`  → ICO semanal a partir de los ICOs diarios.
//
// Son funciones puras (sin dependencias de Prisma, NextAuth ni del DOM), por
// lo que se pueden testear de forma aislada y reutilizar tanto en API routes
// como en Server Components.
// ─────────────────────────────────────────────────────────────────────────────

import { stdDevPopulation } from './dates'

/**
 * Componentes del ICO diario tal como se define en la memoria del TFG.
 *
 * Ts        = nº de trades registrados en la sesión
 * cActive   = nº de condiciones de entrada activas en la estrategia
 * rTrade    = nº de reglas conductuales PER_TRADE activas
 * rSession  = nº de reglas conductuales PER_SESSION activas
 * vTotal    = nº total de violaciones registradas (trades + sesión)
 */
export type IcoInput = {
  Ts: number
  cActive: number
  rTrade: number
  rSession: number
  vTotal: number
}

/**
 * Calcula el ICO diario.
 *
 * Fórmula:
 *   Rs = (Ts × cActive) + (Ts × rTrade) + rSession
 *   ICO = 1 - (vTotal / Rs)
 *
 * Casos especiales:
 *   - Si Rs === 0 (no hay nada que evaluar), ICO = 1 por convención: no se
 *     puede medir disciplina, pero tampoco se penaliza.
 *   - El resultado se clampea a [0, 1]: aunque la entrada esté mal construida
 *     y vTotal > Rs, nunca devolvemos un valor negativo o > 1.
 *   - Redondeamos a 4 decimales para evitar errores acumulados de coma flotante
 *     al persistir el ICO y al compararlo en queries.
 */
export function computeIco({ Ts, cActive, rTrade, rSession, vTotal }: IcoInput): number {
  const Rs = Ts * cActive + Ts * rTrade + rSession
  const raw = Rs === 0 ? 1 : 1 - vTotal / Rs
  return Math.round(Math.max(0, Math.min(1, raw)) * 10_000) / 10_000
}

/**
 * Resultado del cálculo semanal. `null` significa "semana sin sesiones".
 */
export type WeeklyIco = {
  icoWeekly: number
  avgDailyIco: number
  stability: number
}

/**
 * Calcula el ICO semanal combinando media y estabilidad de los ICOs diarios.
 *
 * Fórmula:
 *   M     = media aritmética de los ICOs diarios
 *   σ     = desviación estándar poblacional
 *   E     = max(0, min(1, 1 - σ/0.5))   ← estabilidad conductual
 *   ICO_w = 0.70 × M + 0.30 × E
 *
 * El factor 0.5 normaliza σ al rango [0,1]: es la desviación máxima teórica
 * de un conjunto de valores en [0,1] (distribución Bernoulli). Por tanto
 * E = 1 cuando todos los ICOs son iguales y E = 0 cuando la dispersión es
 * máxima. Esto premia explícitamente la consistencia sobre el desempeño
 * puntual: un trader con 70/70/70 obtiene mayor ICO semanal que otro con
 * 100/40/70 aunque ambos tengan la misma media.
 *
 * Devuelve `null` cuando no hay ICOs (la semana no se pinta en el gráfico),
 * de modo que el llamador no tenga que distinguir entre "semana vacía" y
 * "valores legítimos".
 */
export function computeWeeklyIco(icos: number[]): WeeklyIco | null {
  if (icos.length === 0) return null
  const M = icos.reduce((a, b) => a + b, 0) / icos.length
  const sigma = stdDevPopulation(icos)
  const E = Math.max(0, Math.min(1, 1 - sigma / 0.5))
  return {
    icoWeekly: Math.round((0.7 * M + 0.3 * E) * 10_000) / 10_000,
    avgDailyIco: Math.round(M * 10_000) / 10_000,
    stability: Math.round(E * 10_000) / 10_000,
  }
}
