// ─────────────────────────────────────────────────────────────────────────────
// api/auth/verify/route.ts — confirma la cuenta a partir del token del correo.
//
// Lo consume la página /verify, que es a donde apunta el enlace del mensaje.
// Devuelve un `reason` legible por máquina para que la página pueda ofrecer la
// acción adecuada: reenviar el correo si el token caducó, o llevar al login si
// la cuenta ya estaba confirmada.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const { token } = await request.json().catch(() => ({ token: null }))

  if (!token || typeof token !== 'string') {
    return NextResponse.json(
      { reason: 'INVALID', error: 'Enlace de confirmación no válido' },
      { status: 400 },
    )
  }

  const record = await prisma.verificationToken.findUnique({
    where: { token },
    include: { user: { select: { id: true, email: true, emailVerified: true } } },
  })

  // Un token inexistente y uno ya consumido son indistinguibles aquí, porque el
  // token se borra al usarse. Si la cuenta ya está verificada lo tratamos como
  // éxito más abajo; llegados a este punto, no hay nada que hacer.
  if (!record) {
    return NextResponse.json(
      { reason: 'INVALID', error: 'Este enlace no es válido o ya se ha usado' },
      { status: 400 },
    )
  }

  if (record.user.emailVerified) {
    await prisma.verificationToken.deleteMany({ where: { userId: record.userId } })
    return NextResponse.json({ reason: 'ALREADY_VERIFIED', email: record.user.email })
  }

  if (record.expiresAt < new Date()) {
    // Dejamos el token en la BD: la página necesita saber de qué cuenta era
    // para poder ofrecer el reenvío sin pedir el correo otra vez. El siguiente
    // createVerificationToken lo borrará junto con los demás del usuario.
    return NextResponse.json(
      {
        reason: 'EXPIRED',
        email: record.user.email,
        error: 'El enlace ha caducado. Pide uno nuevo para confirmar tu cuenta.',
      },
      { status: 410 }, // 410 Gone: el recurso existió pero ya no es válido
    )
  }

  // Marcar verificado y consumir el token en la misma transacción: si algo
  // fallase entre ambas operaciones, un token válido podría quedar reutilizable.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: new Date() },
    }),
    prisma.verificationToken.deleteMany({ where: { userId: record.userId } }),
  ])

  return NextResponse.json({ reason: 'VERIFIED', email: record.user.email })
}
