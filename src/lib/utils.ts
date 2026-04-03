// ─────────────────────────────────────────────────────────────────────────────
// utils.ts — funciones de utilidad compartidas en toda la aplicación.
//
// Centralizar utilidades aquí evita duplicar lógica genérica y facilita
// cambiarla en un solo punto si la librería subyacente evoluciona.
// ─────────────────────────────────────────────────────────────────────────────

// Combina clases de Tailwind de forma segura filtrando valores falsy.
// Permite escribir className={cn('base-class', condition && 'conditional-class')}
// sin que los false/null/undefined contaminen el string resultante.
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}
