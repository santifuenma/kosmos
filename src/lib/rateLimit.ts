// ─────────────────────────────────────────────────────────────────────────────
// rateLimit.ts — límite de intentos para las rutas de cuenta.
//
// Sin esto, /login acepta contraseñas ilimitadas, y /register y
// /resend-verification mandan correos ilimitados: lo primero permite adivinar
// una contraseña a base de insistir, y lo segundo convierte a Kosmos en una
// herramienta para inundar el buzón de cualquiera y agotar la cuota de Brevo.
//
// ── Por qué el contador vive en la base de datos ────────────────────────────
// Lo natural sería un Map en memoria, pero en Vercel cada petición puede caer
// en una instancia distinta del servidor. Cada una tendría su propio Map y su
// propio cupo, así que el límite real sería el configurado multiplicado por el
// número de instancias vivas, un número que no controlamos. Guardarlo en
// PostgreSQL —la base que el proyecto ya usa— hace que todas cuenten sobre el
// mismo sitio, sin añadir ningún servicio externo.
//
// ── Qué pasa si la base de datos falla ──────────────────────────────────────
// Dejamos pasar la petición. Parece abrir una puerta, pero las rutas que esto
// protege necesitan la base de datos para hacer su trabajo: si está caída, el
// login no puede comprobar ninguna contraseña. Bloquear además el acceso solo
// añadiría una segunda avería encima de la primera.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma'

type RateLimitRule = {
  // Intentos permitidos dentro de la ventana.
  limit: number
  // Duración de la ventana, en milisegundos.
  windowMs: number
}

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

// Los números salen de comparar lo que hace una persona con lo que hace un
// script. Nadie escribe mal su contraseña diez veces en un cuarto de hora, ni
// se registra cinco veces en una hora; un ataque necesita miles de intentos
// para que le salga a cuenta, y con estos topes no llega ni a acercarse.
export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 15 * MINUTE },
  register: { limit: 5, windowMs: HOUR },
  resendVerification: { limit: 5, windowMs: HOUR },
  // Entrar al demo no pide contraseña, así que no hay nada que adivinar: el
  // tope solo evita que alguien martillee la ruta para cargar la base de
  // datos. Veinte visitas por hora desde una IP sobran para cualquier persona.
  demoLogin: { limit: 20, windowMs: HOUR },
} satisfies Record<string, RateLimitRule>

// La ventana más larga de todas: la purga borra lo que ya quedó fuera de ella.
const LONGEST_WINDOW_MS = Math.max(
  ...Object.values(RATE_LIMITS).map((r) => r.windowMs),
)

// ─────────────────────────────────────────────────────────────────────────────
// Identificación de quien llama
// ─────────────────────────────────────────────────────────────────────────────

// Las cabeceras llegan de dos formas según desde dónde llamemos: como objeto
// `Headers` en las route handlers, y como objeto plano en el `authorize` de
// NextAuth.
type HeaderSource = Headers | Record<string, string | string[] | undefined>

function readHeader(headers: HeaderSource, name: string): string | null {
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name)
  }
  const value = (headers as Record<string, string | string[] | undefined>)[name]
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

// Dirección IP de quien hace la petición.
//
// IMPORTANTE: estas cabeceras las pone el proxy que la aplicación tiene
// delante, y cualquiera puede mandarlas a mano. Solo son fiables porque en
// Vercel es la propia plataforma quien las reescribe antes de que la petición
// llegue hasta aquí. Si algún día Kosmos se sirviera directamente a internet
// sin un proxy que haga eso, un atacante podría inventarse una IP distinta en
// cada intento y saltarse entero el límite por IP. El límite por cuenta
// seguiría aplicándose, y ese es justo el motivo de llevar los dos.
//
// Sin ninguna cabecera (desarrollo local) devolvemos una etiqueta fija: en
// local todo viene de la misma máquina de todas formas.
export function getClientIp(headers: HeaderSource): string {
  const real = readHeader(headers, 'x-real-ip')
  if (real?.trim()) return real.trim()

  const forwarded = readHeader(headers, 'x-forwarded-for')
  if (forwarded) {
    // Puede venir como "cliente, proxy1, proxy2"; el primero es el origen.
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }

  return 'desconocida'
}

// ─────────────────────────────────────────────────────────────────────────────
// Contador
// ─────────────────────────────────────────────────────────────────────────────

export type RateLimitResult = {
  allowed: boolean
  // Segundos que faltan para que la ventana se renueve. Viaja al cliente en la
  // cabecera Retry-After para que sepa cuándo tiene sentido volver a probar.
  retryAfterSeconds: number
}

// ¿Esta clave ya agotó su cupo? No consume nada.
//
// Lo usa el login, donde solo queremos contar los intentos fallidos: si
// contáramos también los buenos, alguien que entra y sale varias veces en una
// misma mañana acabaría bloqueándose a sí mismo.
export async function isRateLimited(
  key: string,
  rule: RateLimitRule,
): Promise<boolean> {
  try {
    const record = await prisma.rateLimit.findUnique({ where: { key } })
    if (!record) return false

    // Ventana vencida: lo que guarde ese contador ya no cuenta para nada.
    if (record.windowStart.getTime() + rule.windowMs <= Date.now()) return false

    return record.count >= rule.limit
  } catch (err) {
    console.error('[rateLimit] no se pudo leer el contador:', err)
    return false
  }
}

// Anota un intento y dice si todavía queda cupo.
export async function consumeRateLimit(
  key: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const now = new Date()

  try {
    // Primero reiniciamos la ventana si venció. Va como updateMany con la
    // condición dentro del where a propósito: comprobar y reiniciar ocurren en
    // la misma sentencia, así que si dos peticiones simultáneas intentan
    // reiniciar, la segunda ya no encuentra fila que encaje y no vuelve a
    // poner el contador a cero.
    await prisma.rateLimit.updateMany({
      where: { key, windowStart: { lt: new Date(now.getTime() - rule.windowMs) } },
      data: { count: 0, windowStart: now },
    })

    // Y ahora sumamos el intento. El `increment` lo resuelve la propia base de
    // datos, no nosotros leyendo y volviendo a escribir, así que dos peticiones
    // a la vez suman dos y no una.
    const record = await prisma.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, windowStart: now },
      update: { count: { increment: 1 } },
    })

    void purgeExpiredRateLimits()

    const windowEndsAt = record.windowStart.getTime() + rule.windowMs
    return {
      allowed: record.count <= rule.limit,
      retryAfterSeconds: Math.max(1, Math.ceil((windowEndsAt - now.getTime()) / 1000)),
    }
  } catch (err) {
    console.error('[rateLimit] no se pudo anotar el intento:', err)
    return { allowed: true, retryAfterSeconds: 0 }
  }
}

// Borra el contador. Se llama tras un intento correcto, para que los fallos
// anteriores no se acumulen contra quien acaba de demostrar que es quien dice.
export async function clearRateLimit(key: string): Promise<void> {
  try {
    await prisma.rateLimit.deleteMany({ where: { key } })
  } catch (err) {
    console.error('[rateLimit] no se pudo limpiar el contador:', err)
  }
}

// Borra los contadores cuya ventana venció hace rato y que, por tanto, ya no
// influyen en ninguna decisión.
//
// No hay ningún cron en el proyecto, así que la limpieza viaja de gorra en una
// de cada cincuenta llamadas. Es suficiente: la tabla crece con el número de
// IPs y cuentas distintas que lo intentan, no con el número de intentos, y en
// cuanto hay tráfico la purga se dispara sola.
async function purgeExpiredRateLimits(): Promise<void> {
  if (Math.random() > 0.02) return

  try {
    await prisma.rateLimit.deleteMany({
      where: { windowStart: { lt: new Date(Date.now() - LONGEST_WINDOW_MS) } },
    })
  } catch (err) {
    console.error('[rateLimit] no se pudo purgar la tabla:', err)
  }
}
