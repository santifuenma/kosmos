// ─────────────────────────────────────────────────────────────────────────────
// api/auth/register/route.ts — endpoint de registro de nuevos usuarios.
//
// No usamos el sistema de registro integrado de NextAuth porque Credentials
// Provider no lo incluye por defecto. Este endpoint es el punto único de
// creación de cuentas: valida, hashea la contraseña y persiste el usuario.
//
// La cuenta nace sin verificar (emailVerified null) y no puede iniciar sesión
// hasta que el usuario pulse el enlace del correo que se le envía aquí mismo.
//
// Está separado de los endpoints `/api/auth/[...nextauth]` gestionados por
// NextAuth para mantener claridad en el código y control total del flujo.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { parseGender, GENDER_OPTIONS } from '@/lib/gender'
import { sendVerificationEmail } from '@/lib/verification'
import { validatePassword } from '@/lib/password'

// Expresión regular para validar el formato básico de un email.
// No validamos con una regex exhaustiva de RFC 5321 porque resulta ilegible
// y en la práctica esta comprobación es suficiente para detectar errores
// tipográficos. La fuente de verdad de emails válidos es el servidor de correo.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Límite defensivo: sin él, un nombre de 10 MB llegaría hasta la BD.
const MAX_NAME_LENGTH = 80

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, firstName, lastName, gender } = body

    const cleanFirstName = typeof firstName === 'string' ? firstName.trim() : ''
    const cleanLastName = typeof lastName === 'string' ? lastName.trim() : ''

    // Comprobamos la presencia de los campos requeridos antes de cualquier
    // consulta a la base de datos para evitar queries innecesarias.
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email y contraseña son obligatorios' },
        { status: 400 },
      )
    }

    if (!cleanFirstName || !cleanLastName) {
      return NextResponse.json(
        { error: 'El nombre y el apellido son obligatorios' },
        { status: 400 },
      )
    }

    if (cleanFirstName.length > MAX_NAME_LENGTH || cleanLastName.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: `El nombre y el apellido no pueden superar los ${MAX_NAME_LENGTH} caracteres` },
        { status: 400 },
      )
    }

    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { error: 'El formato del email no es válido' },
        { status: 400 },
      )
    }

    // La política vive en @/lib/password para que cliente y servidor apliquen
    // exactamente la misma regla y el mensaje de error no se desincronice.
    const passwordError = validatePassword(password)
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 })
    }

    // Un género no reconocido caería silenciosamente en UNDISCLOSED, así que
    // preferimos rechazarlo: si el cliente manda basura es un error de la app,
    // no una preferencia del usuario, y conviene que se note.
    if (gender !== undefined && parseGender(gender) !== gender) {
      return NextResponse.json(
        { error: `El género debe ser uno de: ${GENDER_OPTIONS.map((o) => o.value).join(', ')}` },
        { status: 400 },
      )
    }

    // Comprobamos duplicados antes del insert para devolver un mensaje claro.
    // Sin esta comprobación Prisma lanzaría un error de constraint único (P2002)
    // cuyo mensaje genérico no es apropiado para mostrar al usuario.
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json(
        { error: 'Ya existe una cuenta con este email' },
        { status: 409 }, // 409 Conflict: el recurso ya existe
      )
    }

    // bcrypt con 10 salt rounds: coste computacional que hace los ataques de
    // fuerza bruta prohibitivamente lentos sin penalizar el tiempo de registro
    // para el usuario (aprox. 100ms en hardware moderno).
    // Nunca almacenamos la contraseña en texto plano, solo el hash resultante.
    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName: cleanFirstName,
        lastName: cleanLastName,
        gender: parseGender(gender),
        // emailVerified queda null: la cuenta existe pero aún no puede entrar.
      },
      // `select` excluye el campo `password` de la respuesta.
      // Aunque el hash no es la contraseña original, es buena práctica no
      // exponerlo innecesariamente en las respuestas de la API.
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        gender: true,
        createdAt: true,
      },
    })

    // El envío va después de crear la cuenta y fuera del try principal de la
    // creación: si el proveedor de correo falla, el usuario ya está registrado
    // y puede pedir el reenvío desde la pantalla de login. Perder la cuenta por
    // una caída de Resend sería peor que entregar el correo con retraso.
    try {
      await sendVerificationEmail(user.id, user.email, user.firstName)
    } catch (err) {
      console.error('No se pudo enviar el correo de verificación:', err)
      return NextResponse.json(
        {
          ...user,
          emailSent: false,
          warning: 'Cuenta creada, pero no pudimos enviar el correo de confirmación. Pide el reenvío desde la pantalla de inicio de sesión.',
        },
        { status: 201 },
      )
    }

    return NextResponse.json({ ...user, emailSent: true }, { status: 201 }) // 201 Created
  } catch {
    // Capturamos cualquier error inesperado (conexión BD, etc.) sin filtrarlo
    // al cliente para no revelar detalles internos del sistema.
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 },
    )
  }
}
