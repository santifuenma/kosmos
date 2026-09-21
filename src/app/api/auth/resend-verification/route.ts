// ─────────────────────────────────────────────────────────────────────────────
// api/auth/resend-verification/route.ts — reenvía el correo de confirmación.
//
// Lo usan la pantalla de login (cuando rechaza a un usuario sin verificar) y la
// página /verify (cuando el enlace ha caducado).
//
// La respuesta es siempre la misma pase lo que pase: si distinguiéramos entre
// "no existe esa cuenta", "ya está verificada" y "correo enviado", cualquiera
// podría usar este endpoint para averiguar qué direcciones están registradas.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendVerificationEmail } from '@/lib/verification'
import { normalizeEmail } from '@/lib/emailAddress'
import { RATE_LIMITS, consumeRateLimit, getClientIp } from '@/lib/rateLimit'

const GENERIC_RESPONSE = {
  message: 'Si esa cuenta existe y está pendiente de confirmar, le hemos enviado un enlace nuevo.',
}

export async function POST(request: NextRequest) {
  const { email } = await request.json().catch(() => ({ email: null }))

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email no válido' }, { status: 400 })
  }

  // ── Límite de intentos ──────────────────────────────────────────────────
  // Va ANTES de mirar si la cuenta existe, y por eso gasta cupo tanto si
  // existe como si no. Si solo contáramos los envíos reales, el 429 llegaría
  // únicamente para direcciones registradas y este endpoint volvería a
  // delatar cuáles lo están, que es justo lo que la respuesta genérica evita.
  const normalizedEmail = normalizeEmail(email)

  const [byIp, byEmail] = await Promise.all([
    consumeRateLimit(`resend:ip:${getClientIp(request.headers)}`, RATE_LIMITS.resendVerification),
    consumeRateLimit(`resend:email:${normalizedEmail}`, RATE_LIMITS.resendVerification),
  ])

  if (!byIp.allowed || !byEmail.allowed) {
    const retryAfter = Math.max(byIp.retryAfterSeconds, byEmail.retryAfterSeconds)
    return NextResponse.json(
      { error: 'Demasiadas solicitudes. Inténtalo dentro de un rato.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    )
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, firstName: true, emailVerified: true },
  })

  // Sin cuenta, o ya verificada: no hay nada que enviar, pero respondemos igual
  // que en el caso bueno.
  if (!user || user.emailVerified) {
    return NextResponse.json(GENERIC_RESPONSE)
  }

  try {
    await sendVerificationEmail(user.id, user.email, user.firstName)
  } catch (err) {
    // Registramos el fallo pero no lo exponemos: el mensaje genérico se mantiene
    // para no filtrar la existencia de la cuenta a través del código de estado.
    console.error('No se pudo reenviar el correo de verificación:', err)
  }

  return NextResponse.json(GENERIC_RESPONSE)
}
