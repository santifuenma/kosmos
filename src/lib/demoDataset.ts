// ─────────────────────────────────────────────────────────────────────────────
// demoDataset.ts — el historial de ejemplo del demo público.
//
// Genera la estrategia y las sesiones de la cuenta demo a partir de la fecha
// de hoy: el mes en curso (hasta ayer) y los dos anteriores. Así, entre quien
// entre cuando entre, el dashboard y el historial tienen datos del mes actual.
//
// ── "Los mismos datos, movidos al mes actual" ───────────────────────────────
// Cada día se genera con una semilla fija que depende solo de su posición:
// cuántos meses hace (0 = este, 1 = el pasado, 2 = el anterior) y qué día del
// mes es. El día 14 del mes en curso sale siempre igual, sea septiembre u
// octubre. Dentro de un mes los días ya pasados no cambian; solo se añade el
// de ayer.
//
// ── La historia que cuentan los datos ───────────────────────────────────────
// Un trader que va mejorando: hace dos meses era irregular (días de revenge
// trading, stops movidos), el mes pasado ya se nota el cambio y este mes es
// bastante disciplinado. Es justo lo que Kosmos pretende enseñar a ver.
//
// Es una función pura (sin base de datos) para poder testearla. Quien la
// escribe en la base de datos es src/lib/demoRefresh.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { computeIco } from '@/lib/ico'
import { getStartOfToday } from '@/lib/dates'

// Cambiar este número obliga a regenerar el demo aunque ya estuviera al día:
// forma parte de los ids, y la comprobación de "está al día" compara ids.
export const DEMO_DATASET_VERSION = 2

// ─────────────────────────────────────────────────────────────────────────────
// Estrategia de ejemplo
// ─────────────────────────────────────────────────────────────────────────────

export const DEMO_STRATEGY = {
  name: 'Pullback en tendencia · Apertura europea',
  description:
    'Opero solo a favor de la tendencia de H1 y entro en el retroceso a una zona de soporte o resistencia ' +
    'con volumen. Nada antes de las 09:00 ni después de las 11:30: la primera hora y media concentra el ' +
    'movimiento limpio. Máximo tres operaciones: si el plan no aparece, no hay trade.',
  maxTrades: 3,
  tradingHoursStart: '09:00',
  tradingHoursEnd: '11:30',
}

// Elementos propios del demo que no existen en el catálogo del sistema. Se
// crean como personalizados de la cuenta demo para enseñar esa función.
export const DEMO_CUSTOM_CONDITION = {
  code: 'DEMO_NO_NEWS',
  label: 'Sin noticias de impacto',
  description:
    'No hay publicaciones macro de alto impacto (IPC, tipos de interés, empleo) en los 30 minutos siguientes a la entrada.',
}

export const DEMO_CUSTOM_RULE = {
  code: 'DEMO_MAX_RISK',
  label: 'Riesgo máximo 1 %',
  description:
    'Ninguna operación arriesga más del 1 % de la cuenta. El tamaño se calcula con el stop antes de entrar, no después.',
  scope: 'PER_TRADE' as const,
}

// Qué queda activo en la estrategia. El resto del catálogo se vincula inactivo,
// como hace la app al crear una estrategia.
export const DEMO_ACTIVE_CONDITIONS = ['TREND_CONFIRM', 'SR_LEVEL', 'VOLUME_CONFIRM', 'RR_ACCEPTABLE', DEMO_CUSTOM_CONDITION.code]
export const DEMO_ACTIVE_TRADE_RULES = ['NO_SL_MODIFY', 'NO_EARLY_EXIT', 'NO_IMPULSE_ENTRY', 'NO_REVENGE_TRADE', 'TRADING_HOURS', DEMO_CUSTOM_RULE.code]
export const DEMO_ACTIVE_SESSION_RULES = ['MAX_TRADES_LIMIT']

// ─────────────────────────────────────────────────────────────────────────────
// Textos de ejemplo
// ─────────────────────────────────────────────────────────────────────────────

// Notas del plan del día (se escriben antes de operar).
const PLAN_NOTES = {
  good: [
    'Tendencia alcista clara en H1. Espero retroceso a la zona de 18.650 del DAX con volumen.',
    'Plan: solo cortos si pierde el mínimo de ayer. Si no, me quedo fuera.',
    'Mercado tranquilo, sin datos hasta la tarde. Busco el primer pullback limpio.',
    'Dos zonas marcadas en EUR/USD. Entro solo con confirmación de volumen.',
    'Revisé la semana: mi mejor setup es el retroceso a la media. Hoy solo ese.',
    null,
  ],
  mixed: [
    'Hay IPC a las 11:00. Operar antes o esperar a que pase, nunca durante.',
    'Rango estrecho ayer, posible ruptura. Paciencia con la entrada.',
    'Semana irregular. Reduzco tamaño a la mitad hasta encadenar dos días buenos.',
    'No tengo claro el sesgo. Si a las 10:00 sigue sin dirección, cierro la plataforma.',
    null,
  ],
  bad: [
    'Dormí poco. Tamaño mínimo y máximo dos operaciones.',
    'Vengo de dos días en rojo. Objetivo de hoy: cumplir el plan, no recuperar.',
    'Mucha volatilidad en la apertura. Prohibido entrar en los primeros 15 minutos.',
    'Me noto con ganas de operar. Leer las reglas antes de cada entrada.',
  ],
}

// Notas de operaciones, según qué se incumplió. Cuentan lo que pasó.
const TRADE_NOTES_BY_VIOLATION: Record<string, string[]> = {
  TREND_CONFIRM: ['Entré contra la tendencia de H1 porque "parecía agotada". No lo estaba.', 'Corto en tendencia alcista. El setup no era mío.'],
  SR_LEVEL: ['Entrada en mitad de la nada, sin zona. Me adelanté.', 'No esperé a que llegara al soporte, entré a medio camino.'],
  VOLUME_CONFIRM: ['Sin volumen en la vela de entrada. Lo vi y entré igual.', 'Ruptura sin volumen, falsa como era de esperar.'],
  RR_ACCEPTABLE: ['Objetivo demasiado cerca para el stop que necesitaba. R:R de 1:0,8.', 'Stop amplio por la volatilidad y no ajusté el objetivo.'],
  DEMO_NO_NEWS: ['Entré 10 minutos antes del dato de empleo. Latigazo y fuera.', 'Olvidé mirar el calendario: comparecencia del BCE en plena operación.'],
  NO_SL_MODIFY: ['Alejé el stop cuando se acercaba. Pérdida el doble de lo previsto.', 'Moví el stop a breakeven demasiado pronto y me sacó antes de ir a objetivo.'],
  NO_EARLY_EXIT: ['Cerré con miedo en el primer retroceso; luego fue directo a objetivo.', 'Salí a mitad de camino por nervios.'],
  NO_IMPULSE_ENTRY: ['Entrada por impulso al ver la vela grande. Sin plan.', 'FOMO en la apertura: entré sin esperar el retroceso.'],
  NO_REVENGE_TRADE: ['Después del stop entré enseguida para recuperar. Error clásico.', 'Operación de venganza tras la pérdida anterior, con más tamaño.'],
  TRADING_HOURS: ['Fuera de horario: "una más" a las 11:45.', 'Entré antes de las 9:00 porque ya se estaba moviendo.'],
  DEMO_MAX_RISK: ['Doblé el tamaño "porque lo veía claro". Arriesgué un 2 %.', 'Calculé el tamaño sin el stop real. Riesgo por encima del 1 %.'],
}
const TRADE_NOTES_CLEAN = {
  WIN: ['Retroceso a la zona, volumen y entrada de libro. Objetivo cumplido.', 'Esperé la confirmación y salió bien. Así sí.', 'Dejé correr hasta objetivo sin tocar nada.'],
  LOSS: ['Setup válido, el mercado no acompañó. Stop respetado, pérdida aceptada.', 'Todo según plan y salió mal. Forma parte del juego.'],
  BREAKEVEN: ['Sin continuación. Cerré en tablas como marca el plan.', 'Protegí a breakeven al alcanzar 1R, como dice la regla.'],
}

const ASSETS = ['DAX', 'DAX', 'EURUSD', 'EUROSTOXX', 'GBPUSD', 'XAUUSD']

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de salida
// ─────────────────────────────────────────────────────────────────────────────

export type DemoTrade = {
  id: string
  timestamp: Date
  direction: 'LONG' | 'SHORT'
  result: 'WIN' | 'LOSS' | 'BREAKEVEN'
  asset: string
  pnlAmount: number
  notes: string | null
  conditionCodes: string[] // condiciones incumplidas
  ruleCodes: string[]      // reglas PER_TRADE incumplidas
}

export type DemoDay = {
  sessionId: string
  intentionId: string
  date: Date           // medianoche UTC
  monthsAgo: 0 | 1 | 2
  emotionalState: string
  notes: string | null
  intentionCreatedAt: Date
  confirmedAt: Date
  openedAt: Date
  closedAt: Date
  trades: DemoTrade[]
  sessionRuleCodes: string[] // reglas PER_SESSION incumplidas
  icoScore: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Azar reproducible
// ─────────────────────────────────────────────────────────────────────────────

// mulberry32: generador pequeño y rápido. Con la misma semilla da siempre la
// misma secuencia, que es lo que hace que cada día salga siempre igual.
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeRng(monthsAgo: number, dayOfMonth: number) {
  const rng = mulberry32(20260705 + monthsAgo * 1000 + dayOfMonth * 7919)
  return {
    next: rng,
    chance: (p: number) => rng() < p,
    int: (min: number, max: number) => min + Math.floor(rng() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(rng() * items.length)],
  }
}

type Rng = ReturnType<typeof makeRng>
type Tier = 'good' | 'mixed' | 'bad'

// Cómo de disciplinado es cada mes: [prob. día bueno, prob. día regular].
// El resto son días malos.
const MONTH_PROFILE: Record<0 | 1 | 2, [number, number]> = {
  2: [0.2, 0.3],
  1: [0.3, 0.38],
  0: [0.4, 0.42],
}

// Distribución de infracciones por operación: [cuántas, peso].
const VIOLATIONS_PER_TRADE: Record<Tier, [number, number][]> = {
  good: [[0, 55], [1, 30], [2, 15]],
  mixed: [[1, 15], [2, 40], [3, 45]],
  bad: [[2, 10], [3, 25], [4, 35], [5, 30]],
}

function weightedPick(rng: Rng, options: [number, number][]): number {
  const total = options.reduce((sum, [, w]) => sum + w, 0)
  let roll = rng.next() * total
  for (const [value, weight] of options) {
    roll -= weight
    if (roll < 0) return value
  }
  return options[options.length - 1][0]
}

function at(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000)
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function dayKey(date: Date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Generación
// ─────────────────────────────────────────────────────────────────────────────

const ICO_COUNTS = {
  cActive: DEMO_ACTIVE_CONDITIONS.length,
  rTrade: DEMO_ACTIVE_TRADE_RULES.length,
  rSession: DEMO_ACTIVE_SESSION_RULES.length,
}

const PER_TRADE_VIOLATIONS = [...DEMO_ACTIVE_CONDITIONS, ...DEMO_ACTIVE_TRADE_RULES]

function buildDay(date: Date, monthsAgo: 0 | 1 | 2, rng: Rng): DemoDay {
  const [pGood, pMixed] = MONTH_PROFILE[monthsAgo]
  const roll = rng.next()
  const tier: Tier = roll < pGood ? 'good' : roll < pGood + pMixed ? 'mixed' : 'bad'

  const emotionalState =
    tier === 'good' ? rng.pick(['CONFIDENT', 'NEUTRAL', 'CONFIDENT'])
      : tier === 'mixed' ? rng.pick(['NEUTRAL', 'ANXIOUS', 'TIRED'])
        : rng.pick(['FRUSTRATED', 'ANXIOUS', 'TIRED'])

  const nTrades = tier === 'good' ? rng.int(1, 3) : tier === 'mixed' ? rng.int(2, 3) : rng.int(3, 5)
  // Cuántas cosas se incumplen en cada operación. Con 11 elementos activos,
  // cada operación suma 11 casillas al denominador del ICO, así que una
  // infracción suelta apenas se nota: un día malo de verdad (entrar sin
  // tendencia, sin zona y sin volumen, con el doble de riesgo…) acumula
  // varias en la misma operación. Así los días salen verdes, amarillos y rojos
  // en el calendario, como con un trader real.
  const violationsPerTrade = VIOLATIONS_PER_TRADE[tier]

  const key = dayKey(date)
  const v = DEMO_DATASET_VERSION
  const trades: DemoTrade[] = []
  let minute = 9 * 60 + rng.int(4, 20) // primera entrada entre 09:04 y 09:20

  for (let n = 0; n < nTrades; n++) {
    const hadLoss = trades.some((t) => t.result === 'LOSS')
    const violations: string[] = []
    const count = weightedPick(rng, violationsPerTrade)
    // En días malos, tras una pérdida, lo típico es precisamente la venganza.
    if (count > 0 && tier === 'bad' && hadLoss && rng.chance(0.6)) violations.push('NO_REVENGE_TRADE')
    while (violations.length < count) {
      // La venganza solo tiene sentido después de una pérdida.
      const pool = PER_TRADE_VIOLATIONS.filter(
        (c) => !violations.includes(c) && (c !== 'NO_REVENGE_TRADE' || hadLoss),
      )
      violations.push(rng.pick(pool))
    }

    // Incumplir el plan empeora las probabilidades, como en la vida real.
    const pWin = (tier === 'good' ? 0.62 : tier === 'mixed' ? 0.5 : 0.35) - (violations.length ? 0.2 : 0)
    const r = rng.next()
    const result: DemoTrade['result'] = r < pWin ? 'WIN' : r < pWin + 0.12 ? 'BREAKEVEN' : 'LOSS'

    const overRisk = violations.includes('DEMO_MAX_RISK') || violations.includes('NO_SL_MODIFY')
    const pnlAmount =
      result === 'WIN' ? rng.int(90, 380)
        : result === 'LOSS' ? -(overRisk ? rng.int(280, 460) : rng.int(70, 210))
          : rng.int(-12, 12)

    // Hora: dentro del horario salvo que la violación sea precisamente esa.
    let timestamp: Date
    if (violations.includes('TRADING_HOURS')) {
      // Tarde (11:35–11:55) o justo antes de abrir (08:57–08:59, ya con la
      // sesión abierta a las 08:56).
      timestamp = at(date, rng.chance(0.7) ? 11 * 60 + rng.int(35, 55) : 8 * 60 + rng.int(57, 59))
    } else {
      minute = Math.min(minute, 11 * 60 + 20)
      timestamp = at(date, minute)
    }
    minute += rng.int(18, 40)

    const notes = violations.length
      ? rng.pick(TRADE_NOTES_BY_VIOLATION[violations[0]])
      : rng.chance(0.4) ? rng.pick(TRADE_NOTES_CLEAN[result]) : null

    trades.push({
      id: `demo${v}t${key}n${n}`,
      timestamp,
      direction: rng.pick(['LONG', 'SHORT'] as const),
      result,
      asset: rng.pick(ASSETS),
      pnlAmount,
      notes,
      conditionCodes: violations.filter((c) => DEMO_ACTIVE_CONDITIONS.includes(c)),
      ruleCodes: violations.filter((c) => DEMO_ACTIVE_TRADE_RULES.includes(c)),
    })
  }

  trades.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  const sessionRuleCodes = nTrades > DEMO_STRATEGY.maxTrades ? ['MAX_TRADES_LIMIT'] : []

  const vTotal =
    trades.reduce((sum, t) => sum + t.conditionCodes.length + t.ruleCodes.length, 0) + sessionRuleCodes.length

  const lastTrade = trades[trades.length - 1].timestamp

  return {
    sessionId: `demo${v}s${key}`,
    intentionId: `demo${v}i${key}`,
    date,
    monthsAgo,
    emotionalState,
    notes: rng.pick(PLAN_NOTES[tier]),
    intentionCreatedAt: at(date, 8 * 60 + rng.int(30, 45)),
    confirmedAt: at(date, 8 * 60 + rng.int(46, 55)),
    openedAt: at(date, 8 * 60 + 56),
    closedAt: new Date(Math.max(lastTrade.getTime(), at(date, 9 * 60).getTime()) + rng.int(12, 30) * 60_000),
    trades,
    sessionRuleCodes,
    icoScore: computeIco({ Ts: trades.length, ...ICO_COUNTS, vTotal }),
  }
}

// Todas las sesiones del demo para la fecha dada: los dos meses anteriores
// completos y el actual hasta ayer. Solo días laborables, y no todos: un
// trader real se salta alguno.
export function buildDemoDataset(now: Date = new Date()): DemoDay[] {
  const today = getStartOfToday(now)
  const days: DemoDay[] = []

  for (const monthsAgo of [2, 1, 0] as const) {
    const year = today.getUTCFullYear()
    const month = today.getUTCMonth() - monthsAgo
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(Date.UTC(year, month, day))
      if (date >= today) break
      const weekday = date.getUTCDay()
      if (weekday === 0 || weekday === 6) continue

      const rng = makeRng(monthsAgo, day)
      if (rng.chance(0.15)) continue // día sin operar
      days.push(buildDay(date, monthsAgo, rng))
    }
  }

  return days
}
