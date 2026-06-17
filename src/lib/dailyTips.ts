// ─────────────────────────────────────────────────────────────────────────────
// dailyTips.ts — colección de "frases del día" que se muestran al trader
// durante la sesión activa, junto a su intención diaria.
//
// El tip rota cada día de forma determinista (no aleatoria) para que el
// mismo día siempre muestre la misma frase: así el trader no puede recargar
// para "buscar" un mensaje distinto, y la frase actúa como anclaje del día.
// ─────────────────────────────────────────────────────────────────────────────

export const DAILY_TIPS = [
  'Sigue tus reglas aunque el mercado parezca obvio.',
  'Respeta tu Stop-Loss siempre, sin excepciones.',
  'La disciplina hoy construye la confianza de mañana.',
  'Si dudas, no entres. La claridad es una condición de entrada.',
  'No persigas el mercado. Si lo perdiste, habrá otra oportunidad.',
  'Un trade impulsivo puede borrar días de trabajo disciplinado.',
  'El objetivo no es acertar — es ejecutar el plan.',
  'La paciencia también es una posición.',
  'El mercado siempre estará mañana. Tu capital, no necesariamente.',
  'Opera tu estrategia, no tus emociones.',
  'Un día sin trades es un día sin violaciones.',
  'Las reglas existen para los días difíciles, no para los fáciles.',
  'El mejor trade que puedes hacer es no hacer el trade incorrecto.',
  'Reduce tu tamaño cuando el mercado no está claro.',
  'Anota cada operación. La reflexión es parte del proceso.',
] as const

/**
 * Devuelve el tip del día actual. Usa el índice de día desde epoch módulo
 * el tamaño del array, así la frase cambia a las 00:00 UTC y es estable
 * durante toda la jornada.
 */
export function getDailyTip(now: Date = new Date()): string {
  const dayIndex = Math.floor(now.getTime() / 86_400_000) % DAILY_TIPS.length
  return DAILY_TIPS[dayIndex]
}
