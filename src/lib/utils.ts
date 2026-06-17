// ─────────────────────────────────────────────────────────────────────────────
// utils.ts — funciones de utilidad genéricas compartidas en toda la aplicación.
//
// Centralizar utilidades aquí evita duplicar lógica y facilita cambiarla en
// un solo punto si la librería subyacente o el criterio de formato evoluciona.
// Helpers de fecha → ver `lib/dates.ts`; copys/contenido → ver `lib/dailyTips.ts`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Combina nombres de clases CSS de forma segura filtrando valores falsy.
 * Permite escribir `className={cn('base', condition && 'conditional')}`
 * sin que los false/null/undefined contaminen el string resultante.
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

/**
 * Pone en mayúsculas la primera letra de una cadena.
 * Usado para nombres de día/mes producidos por `toLocaleDateString('es-ES')`,
 * que en español devuelven la primera letra en minúscula.
 */
export function capitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/**
 * Suma todas las violaciones de una sesión: las de cada trade individual
 * (PER_TRADE + CONDITION) más las de sesión (PER_SESSION).
 *
 * Se usa en dashboard, historial y otras vistas agregadas, donde solo nos
 * interesa el conteo total y no el desglose por tipo.
 */
type SessionForViolationCount = {
  violations: { id: string }[]
  trades: { violations: { id: string }[] }[]
}

export function countSessionViolations(s: SessionForViolationCount): number {
  return s.violations.length + s.trades.reduce((sum, t) => sum + t.violations.length, 0)
}
