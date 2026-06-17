// ─────────────────────────────────────────────────────────────────────────────
// dates.ts — utilidades de fecha compartidas en toda la aplicación.
//
// Centralizar estos helpers evita redefiniciones inconsistentes en cada API
// route y página, y garantiza que todas las consultas usen el mismo criterio
// de "día" (medianoche UTC). Trabajamos en UTC para que las queries y los
// filtros de Prisma sean independientes del huso horario del cliente.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inicio del día (00:00:00.000 UTC) que contiene la fecha dada.
 * Si no se pasa argumento, usa el momento actual.
 *
 * Se usa para:
 *  - Filtrar la intención/sesión del día actual: `date >= getStartOfToday()`
 *  - Normalizar el campo `date` al guardar (evita colisiones por milisegundos)
 */
export function getStartOfToday(reference: Date = new Date()): Date {
  return new Date(Date.UTC(
    reference.getUTCFullYear(),
    reference.getUTCMonth(),
    reference.getUTCDate(),
  ))
}

/**
 * Inicio del día siguiente al de la fecha dada, en UTC. Complemento de
 * `getStartOfToday` para construir rangos semiabiertos `[hoy, mañana)`.
 */
export function getStartOfTomorrow(reference: Date = new Date()): Date {
  return new Date(Date.UTC(
    reference.getUTCFullYear(),
    reference.getUTCMonth(),
    reference.getUTCDate() + 1,
  ))
}

/**
 * Lunes (00:00 UTC) de la semana ISO que contiene la fecha dada.
 * En el estándar ISO 8601 la semana empieza el lunes; en JS `getUTCDay()`
 * devuelve 0 para domingo, así que necesitamos un ajuste explícito.
 */
export function getMondayUTC(date: Date): Date {
  const d = getStartOfToday(date)
  const day = d.getUTCDay()
  // domingo (0) → retroceder 6 días; lunes (1) → 0 días; martes (2) → 1; etc.
  const daysToMonday = day === 0 ? 6 : day - 1
  d.setUTCDate(d.getUTCDate() - daysToMonday)
  return d
}

/**
 * Número de semana ISO 8601 de una fecha (1-53).
 * La semana 1 es la que contiene el primer jueves del año.
 *
 * Se usa para etiquetar gráficos con "Sem 14" sin depender de librerías
 * externas de fechas.
 */
export function getISOWeekNumber(date: Date): number {
  const d = getStartOfToday(date)
  // getUTCDay devuelve 0 para domingo; convertimos a 7 para que el cálculo
  // del jueves de la semana ISO funcione.
  const dayNum = d.getUTCDay() || 7
  // Movemos al jueves de la misma semana ISO.
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

/**
 * Desviación estándar poblacional (no muestral).
 *
 * Usamos la poblacional porque para cada cálculo tenemos el conjunto
 * completo de sesiones del periodo, no una muestra de una población mayor.
 * Devuelve 0 cuando hay 0 o 1 valor (no hay variabilidad).
 */
export function stdDevPopulation(values: number[]): number {
  if (values.length <= 1) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}
