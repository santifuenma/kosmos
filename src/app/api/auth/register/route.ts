// ─────────────────────────────────────────────────────────────────────────────
// api/auth/register/route.ts — endpoint de registro de nuevos usuarios.
//
// No usamos el sistema de registro integrado de NextAuth porque Credentials
// Provider no lo incluye por defecto. Este endpoint es el punto único de
// creación de cuentas: valida, hashea la contraseña y persiste el usuario.
//
// Está separado de los endpoints `/api/auth/[...nextauth]` gestionados por
// NextAuth para mantener claridad en el código y control total del flujo.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

// Expresión regular para validar el formato básico de un email.
// No validamos con una regex exhaustiva de RFC 5321 porque resulta ilegible
// y en la práctica esta comprobación es suficiente para detectar errores
// tipográficos. La fuente de verdad de emails válidos es el servidor de correo.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, name } = body

    // Comprobamos la presencia de los campos requeridos antes de cualquier
    // consulta a la base de datos para evitar queries innecesarias.
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email y contraseña son obligatorios' },
        { status: 400 },
      )
    }

    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { error: 'El formato del email no es válido' },
        { status: 400 },
      )
    }

    // Mínimo de 6 caracteres: equilibrio entre seguridad básica y usabilidad.
    // En un entorno de producción real se exigiría mayor complejidad.
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 6 caracteres' },
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
        name: name?.trim() || null, // Normalizamos espacios; null si no se proporcionó
      },
      // `select` excluye el campo `password` de la respuesta.
      // Aunque el hash no es la contraseña original, es buena práctica no
      // exponerlo innecesariamente en las respuestas de la API.
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    })

    return NextResponse.json(user, { status: 201 }) // 201 Created
  } catch {
    // Capturamos cualquier error inesperado (conexión BD, etc.) sin filtrarlo
    // al cliente para no revelar detalles internos del sistema.
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 },
    )
  }
}
