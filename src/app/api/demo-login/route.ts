import { NextRequest, NextResponse } from 'next/server'
import { encode } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { dbFor, isDemoDatabaseConfigured } from '@/lib/prisma'
import { DEMO_USER_EMAIL } from '@/lib/demo'
import { DEMO_SANDBOX_COOKIE } from '@/lib/demoSandbox'
import { ensureDemoDataFresh } from '@/lib/demoRefresh'
import { parseGender } from '@/lib/gender'
import { RATE_LIMITS, consumeRateLimit, getClientIp } from '@/lib/rateLimit'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/demo-login
// Destino del botón "Ver demo" del portfolio. Abre una sesión con la cuenta
// del demo y lleva al dashboard, sin formulario ni contraseña.
//
// ── Cómo abre la sesión ─────────────────────────────────────────────────────
// Kosmos no usa Supabase Auth, así que aquí no hay "service role key" que
// valga: la sesión es un token JWT de NextAuth guardado en una cookie. Esta
// ruta fabrica ese token igual que lo haría el login normal (mismos campos,
// misma clave NEXTAUTH_SECRET, misma cookie) y lo deja en el navegador. A
// partir de ahí el resto de la app no distingue cómo se entró.
//
// La clave NEXTAUTH_SECRET solo existe en el servidor. Sin ella nadie puede
// fabricarse un token, ni del demo ni de ninguna otra cuenta.
//
// ── Por qué es seguro que sea tan fácil ─────────────────────────────────────
// La cuenta del demo es de solo lectura por dos vías independientes: el proxy
// corta cualquier escritura suya a la API, y sus consultas van a Postgres con
// el rol kosmos_demo, que no tiene permiso para escribir. Regalar la sesión no
// regala ningún poder.
//
// Es GET a propósito: un enlace normal del portfolio basta para entrar.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const limit = await consumeRateLimit(
    `demo-login:ip:${getClientIp(request.headers)}`,
    RATE_LIMITS.demoLogin,
  )
  if (!limit.allowed) {
    return new NextResponse(
      'Demasiadas entradas al demo desde esta conexión. Prueba de nuevo más tarde.',
      {
        status: 429,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Retry-After': String(limit.retryAfterSeconds),
        },
      },
    )
  }

  // Sin la conexión de solo lectura no abrimos el demo: sus consultas
  // fallarían todas, y no hay alternativa segura con la que sustituirla.
  const secret = process.env.NEXTAUTH_SECRET
  if (!isDemoDatabaseConfigured() || !secret) {
    return demoUnavailable()
  }

  // Leemos al usuario con la propia conexión del demo. Así, si el rol
  // kosmos_demo no puede entrar (contraseña mal puesta, rol sin crear…), se
  // nota aquí y no a mitad del dashboard.
  let user
  try {
    user = await dbFor({ email: DEMO_USER_EMAIL }).user.findUnique({
      where: { email: DEMO_USER_EMAIL },
      select: { id: true, email: true, firstName: true, lastName: true, gender: true },
    })
  } catch (err) {
    console.error('[GET /api/demo-login] no se pudo leer el usuario demo:', err)
    return demoUnavailable()
  }
  if (!user) return demoUnavailable()

  // El historial de ejemplo se mueve con el calendario: la primera entrada de
  // cada día lo regenera para que termine ayer (ver src/lib/demoRefresh.ts).
  await ensureDemoDataFresh()

  // Los mismos campos que dejan en el token el login normal de NextAuth
  // (name, email, sub) y nuestro callback jwt de src/lib/auth.ts.
  const maxAge = authOptions.session?.maxAge ?? 30 * 24 * 60 * 60
  const token = await encode({
    secret,
    maxAge,
    token: {
      sub: user.id,
      name: user.firstName,
      email: user.email,
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      gender: parseGender(user.gender),
    },
  })

  // Mismo nombre y opciones de cookie que usa NextAuth: con https lleva el
  // prefijo __Secure- (el navegador solo la acepta por https), sin él no.
  const secure =
    process.env.NEXTAUTH_URL?.startsWith('https://') ?? Boolean(process.env.VERCEL)

  // La base de la URL sale de NEXTAUTH_URL y no de la petición: en local el
  // servidor escucha en 0.0.0.0 y request.url mandaría al navegador allí.
  const response = NextResponse.redirect(
    new URL('/dashboard', process.env.NEXTAUTH_URL ?? request.url),
  )
  response.cookies.set({
    name: `${secure ? '__Secure-' : ''}next-auth.session-token`,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
    maxAge,
  })
  // Cada entrada empieza de cero: se tira la sesión simulada que quedara de
  // una visita anterior (ver src/lib/demoSandbox.ts).
  response.cookies.delete(DEMO_SANDBOX_COOKIE)
  return response
}

function demoUnavailable() {
  return new NextResponse('El demo no está disponible en este momento.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
