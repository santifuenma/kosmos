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

const GENERIC_RESPONSE = {
  message: 'Si esa cuenta existe y está pendiente de confirmar, le hemos enviado un enlace nuevo.',
}

export async function POST(request: NextRequest) {
  const { email } = await request.json().catch(() => ({ email: null }))

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email no válido' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { email },
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
