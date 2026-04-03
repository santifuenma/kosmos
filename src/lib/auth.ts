// ─────────────────────────────────────────────────────────────────────────────
// auth.ts — configuración central de NextAuth.js para Kosmos.
//
// Usamos el provider Credentials (email + contraseña) porque Kosmos es una
// herramienta de uso personal/interno donde no tiene sentido delegar la
// identidad a terceros (Google, GitHub…). El usuario debe registrarse
// explícitamente y comprometerse con la plataforma.
//
// Estrategia de sesión JWT (sin base de datos): cada petición autenticada
// lleva un token firmado en una cookie httpOnly. Esto simplifica la
// arquitectura al no necesitar una tabla de sesiones en la BD, y es suficiente
// para el alcance del MVP. Si en el futuro se necesita invalidación de sesiones
// en tiempo real (p.ej., cerrar sesión desde otro dispositivo), habría que
// migrar a sesiones en base de datos con @auth/prisma-adapter.
// ─────────────────────────────────────────────────────────────────────────────

import { NextAuthOptions, getServerSession } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export const authOptions: NextAuthOptions = {
  session: {
    // JWT: la sesión vive en el token del cliente, no en la BD.
    // Esto significa que el logout no invalida el token inmediatamente en el
    // servidor — el token expira según `maxAge`. Aceptable para el MVP.
    strategy: 'jwt',
  },
  pages: {
    // Redirigir a nuestra página de login personalizada en lugar de la
    // pantalla genérica de NextAuth cuando el usuario no está autenticado.
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        // Si faltan campos devolvemos null, lo que NextAuth interpreta como
        // credenciales inválidas y muestra el error al cliente.
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        // Buscamos el usuario por email. Si no existe, devolvemos null
        // deliberadamente sin distinguir entre "email no encontrado" y
        // "contraseña incorrecta". Dar mensajes distintos facilitaría
        // la enumeración de usuarios registrados.
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        })

        if (!user) return null

        // bcrypt.compare es el método seguro para verificar contraseñas hasheadas.
        // Nunca comparamos en texto plano porque el hash es irreversible por diseño.
        const passwordMatch = await bcrypt.compare(
          credentials.password,
          user.password,
        )

        if (!passwordMatch) return null

        // Devolvemos solo los campos que necesitamos en el token/sesión.
        // Excluimos el hash de la contraseña explícitamente para que nunca
        // llegue al cliente aunque el callback jwt lo procese todo.
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
        }
      },
    }),
  ],
  callbacks: {
    // El callback jwt se ejecuta cuando se crea o refresca el token.
    // Incrustamos el `id` del usuario en el token porque por defecto NextAuth
    // no lo incluye, y lo necesitamos en los Server Components y API routes
    // para consultar la base de datos sin hacer una query extra por email.
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },

    // El callback session transforma el token JWT en el objeto de sesión
    // que reciben los componentes vía `useSession()` o `getServerSession()`.
    // Propagamos el `id` del token a `session.user` para tenerlo disponible
    // en toda la aplicación con el tipo extendido en `src/types/next-auth.d.ts`.
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
      }
      return session
    },
  },
}

// Re-exportamos getServerSession junto con authOptions para que los Server
// Components e API routes puedan importar ambos desde un único módulo:
//   import { getServerSession, authOptions } from '@/lib/auth'
export { getServerSession }
