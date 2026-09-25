// ─────────────────────────────────────────────────────────────────────────────
// demoSandbox.ts — la sesión de trading "de mentira" del demo público.
//
// El demo deja recorrer el flujo completo (plan del día → confirmar → registrar
// operaciones → cerrar → ver el ICO) sin que nada llegue a la base de datos.
// Lo que el visitante hace hoy vive en una cookie de su propio navegador:
//
//   · Cifrada (AES-256-GCM con una clave derivada de NEXTAUTH_SECRET): el
//     visitante no puede leerla ni editarla a mano para fabricar datos raros.
//   · De sesión (sin fecha de caducidad): el navegador la tira al cerrarse.
//     Recargar la página no la borra, así que el flujo no se rompe al pasar de
//     una pantalla a otra; entrar de nuevo por "Ver demo" empieza de cero.
//   · Solo vale para hoy: si el día cambia, se ignora, igual que la app real
//     solo tiene en cuenta la intención y la sesión del día.
//
// ¿Por qué una cookie y no la memoria del navegador? Porque varias pantallas
// (dashboard, resumen de sesión) las pinta el servidor. Una cookie viaja con
// cada petición, así que el servidor puede mostrar la sesión simulada junto a
// los datos sembrados.
//
// La base de datos sigue siendo de solo lectura para el demo (rol kosmos_demo).
// Esto no la sustituye: si algo se saltara este fichero y llegara a Postgres,
// Postgres lo rechazaría igualmente.
// ─────────────────────────────────────────────────────────────────────────────

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { deflateRawSync, inflateRawSync } from 'zlib'
import { cookies } from 'next/headers'
import type { PrismaClient, BehavioralRule, EntryCondition } from '@prisma/client'
import { DEMO_USER_EMAIL } from '@/lib/demo'
import { getStartOfToday } from '@/lib/dates'

const COOKIE_NAME = 'kosmos-demo-sandbox'

// Las cookies no pueden pasar de ~4 KB. Dejamos margen para el nombre y los
// atributos. Con los límites de abajo, una sesión normal ocupa muy por debajo.
const MAX_COOKIE_BYTES = 3800

// Topes propios del demo (la app real no los tiene). Sirven para que la
// cookie nunca crezca más de lo que cabe.
export const DEMO_LIMITS = {
  trades: 12,
  intentionNotes: 300,
  tradeNotes: 200,
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Lo que se guarda
// ─────────────────────────────────────────────────────────────────────────────
// Solo lo imprescindible, y referencias por id al catálogo (reglas y
// condiciones), igual que hace la base de datos real. Los textos de cada regla
// se recuperan al leer (ver hydrate).

export type SandboxTrade = {
  id: string
  timestamp: string
  direction: 'LONG' | 'SHORT'
  result: 'WIN' | 'LOSS' | 'BREAKEVEN'
  asset: string | null
  pnlAmount: number | null
  notes: string | null
  conditionIds: string[] // EntryCondition incumplidas
  ruleIds: string[]      // BehavioralRule (PER_TRADE) incumplidas
}

export type SandboxState = {
  day: string // getStartOfToday() en ISO: la cookie solo vale ese día
  intention: {
    id: string
    createdAt: string
    strategyId: string
    maxTrades: number
    tradingHoursStart: string
    tradingHoursEnd: string
    emotionalState: string
    notes: string | null
    confirmedAt: string | null
  }
  session: null | {
    id: string
    createdAt: string
    status: 'OPEN' | 'CLOSED'
    closedAt: string | null
    icoScore: number | null
    trades: SandboxTrade[]
    sessionRuleIds: string[] // BehavioralRule (PER_SESSION) incumplidas
  }
}

export class DemoSandboxFullError extends Error {}

export function newDemoId(): string {
  return `demo_${randomBytes(8).toString('hex')}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Cifrado
// ─────────────────────────────────────────────────────────────────────────────

function key(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET no está configurada')
  // Clave propia para este uso: no reutilizamos la del token de sesión tal cual.
  return createHash('sha256').update(`${secret}:kosmos-demo-sandbox`).digest()
}

function seal(state: SandboxState): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  // Comprimimos antes de cifrar: el JSON repite mucho (nombres de campo, ids)
  // y así cabe bastante más en la cookie.
  const body = Buffer.concat([cipher.update(deflateRawSync(JSON.stringify(state))), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')
}

function unseal(value: string): SandboxState | null {
  try {
    const raw = Buffer.from(value, 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12))
    // La etiqueta de autenticación hace que cualquier cambio en la cookie
    // haga fallar el descifrado: una cookie manipulada se trata como vacía.
    decipher.setAuthTag(raw.subarray(12, 28))
    const json = inflateRawSync(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]))
    return JSON.parse(json.toString('utf8')) as SandboxState
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Leer y escribir
// ─────────────────────────────────────────────────────────────────────────────

// Estado de hoy, o null si no hay (o es de otro día, o no se puede leer).
// Funciona en Server Components y en Route Handlers.
export async function readSandbox(): Promise<SandboxState | null> {
  const value = (await cookies()).get(COOKIE_NAME)?.value
  if (!value) return null
  const state = unseal(value)
  if (!state || state.day !== getStartOfToday().toISOString()) return null
  return state
}

// Solo desde Route Handlers: los Server Components no pueden poner cookies.
export async function writeSandbox(state: SandboxState): Promise<void> {
  const value = seal(state)
  if (value.length > MAX_COOKIE_BYTES) throw new DemoSandboxFullError()
  ;(await cookies()).set(COOKIE_NAME, value, cookieOptions())
}

export async function clearSandbox(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME)
}

export const DEMO_SANDBOX_COOKIE = COOKIE_NAME

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: process.env.NEXTAUTH_URL?.startsWith('https://') ?? Boolean(process.env.VERCEL),
    // Sin maxAge ni expires: cookie de sesión, se va al cerrar el navegador.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconstruir con la forma de Prisma
// ─────────────────────────────────────────────────────────────────────────────
// Las páginas y rutas esperan objetos con la forma que devuelve Prisma
// (session.trades[].violations[].rule.label, etc.). Aquí montamos esos objetos
// a partir de la cookie, recuperando reglas y condiciones del catálogo con la
// conexión de solo lectura. Así el resto del código los usa sin distinguir si
// vienen de la base de datos o del demo.

export async function hydrateSandbox(state: SandboxState, db: PrismaClient, userId: string) {
  const s = state.session
  const ruleIds = [...new Set([...(s?.sessionRuleIds ?? []), ...(s?.trades.flatMap((t) => t.ruleIds) ?? [])])]
  const conditionIds = [...new Set(s?.trades.flatMap((t) => t.conditionIds) ?? [])]

  const [rules, conditions] = await Promise.all([
    ruleIds.length ? db.behavioralRule.findMany({ where: { id: { in: ruleIds } } }) : [],
    conditionIds.length ? db.entryCondition.findMany({ where: { id: { in: conditionIds } } }) : [],
  ])
  const ruleById = new Map<string, BehavioralRule>(rules.map((r) => [r.id, r]))
  const conditionById = new Map<string, EntryCondition>(conditions.map((c) => [c.id, c]))

  const i = state.intention
  const intention = {
    id: i.id,
    userId,
    strategyId: i.strategyId,
    date: new Date(state.day),
    maxTrades: i.maxTrades,
    tradingHoursStart: i.tradingHoursStart,
    tradingHoursEnd: i.tradingHoursEnd,
    emotionalState: i.emotionalState,
    notes: i.notes,
    confirmedAt: i.confirmedAt ? new Date(i.confirmedAt) : null,
    createdAt: new Date(i.createdAt),
  }

  if (!s) return { intention, session: null }

  const trades = s.trades.map((t) => {
    const createdAt = new Date(t.timestamp)
    const violations = [
      ...t.conditionIds.map((conditionId, n) => ({
        id: `${t.id}_c${n}`,
        tradeId: t.id,
        ruleId: null,
        conditionId,
        type: 'CONDITION_VIOLATION',
        createdAt,
        rule: null,
        condition: conditionById.get(conditionId) ?? null,
      })),
      ...t.ruleIds.map((ruleId, n) => ({
        id: `${t.id}_r${n}`,
        tradeId: t.id,
        ruleId,
        conditionId: null,
        type: 'RULE_VIOLATION',
        createdAt,
        rule: ruleById.get(ruleId) ?? null,
        condition: null,
      })),
    ]
    return {
      id: t.id,
      sessionId: s.id,
      timestamp: createdAt,
      direction: t.direction,
      result: t.result,
      asset: t.asset,
      pnlAmount: t.pnlAmount,
      notes: t.notes,
      createdAt,
      violations,
    }
  })

  const session = {
    id: s.id,
    userId,
    intentionId: i.id,
    date: new Date(state.day),
    status: s.status,
    icoScore: s.icoScore,
    createdAt: new Date(s.createdAt),
    closedAt: s.closedAt ? new Date(s.closedAt) : null,
    trades,
    violations: s.sessionRuleIds.flatMap((ruleId, n) => {
      const rule = ruleById.get(ruleId)
      return rule
        ? [{ id: `${s.id}_s${n}`, sessionId: s.id, ruleId, createdAt: new Date(s.closedAt ?? s.createdAt), rule }]
        : []
    }),
    intention,
    _count: { trades: trades.length },
  }

  return { intention, session }
}

export type HydratedSandbox = Awaited<ReturnType<typeof hydrateSandbox>>
export type HydratedDemoSession = NonNullable<HydratedSandbox['session']>

// Atajo para las páginas: la sesión simulada de hoy, ya montada, si la
// cuenta es la del demo y hay algo guardado.
export async function loadDemoSandbox(
  user: { email?: string | null; id: string },
  db: PrismaClient,
): Promise<HydratedSandbox | null> {
  if (user.email !== DEMO_USER_EMAIL) return null
  const state = await readSandbox()
  return state ? hydrateSandbox(state, db, user.id) : null
}
