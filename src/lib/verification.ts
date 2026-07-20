// ─────────────────────────────────────────────────────────────────────────────
// verification.ts — emisión y envío de los tokens de confirmación de correo.
//
// Vive aparte del endpoint de registro porque el mismo flujo se necesita en dos
// sitios: al crear la cuenta y cuando el usuario pide que le reenviemos el
// mensaje desde la pantalla de login.
// ─────────────────────────────────────────────────────────────────────────────

import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendEmail, verificationEmail } from '@/lib/email'

// 24 horas. Suficiente para que alguien revise el correo con calma y lo bastante
// corto para que un mensaje reenviado o filtrado deje de servir pronto.
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000

// Base sobre la que se construye el enlace. En Vercel, NEXTAUTH_URL puede no
// estar definida en los despliegues de preview, así que caemos a VERCEL_URL
// (que no incluye protocolo) y por último a localhost para desarrollo.
function getAppUrl(): string {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

// Genera un token nuevo e invalida los anteriores del usuario. Borrar los
// previos evita que queden varios enlaces válidos a la vez: si alguien pide un
// reenvío porque sospecha que el primer correo se filtró, el viejo deja de valer.
//
// 32 bytes aleatorios en hexadecimal (64 caracteres) es el mismo orden de
// magnitud que usan las librerías de sesión: no adivinable por fuerza bruta.
export async function createVerificationToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')

  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { userId } }),
    prisma.verificationToken.create({
      data: {
        userId,
        token,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    }),
  ])

  return token
}

// Emite el token y manda el correo. Devuelve el enlace para que quien llame
// pueda registrarlo si hace falta; nunca se expone al cliente, porque cualquiera
// que lo tuviera podría activar una cuenta ajena.
export async function sendVerificationEmail(
  userId: string,
  email: string,
  firstName: string,
): Promise<string> {
  const token = await createVerificationToken(userId)
  const verifyUrl = `${getAppUrl()}/verify?token=${token}`

  const { subject, html, text } = verificationEmail(firstName, verifyUrl)
  await sendEmail({ to: email, subject, html, text })

  return verifyUrl
}
