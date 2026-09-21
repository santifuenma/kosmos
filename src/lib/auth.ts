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
import { parseGender, type Gender } from '@/lib/gender'
import { normalizeEmail } from '@/lib/emailAddress'

// Hash de una cadena aleatoria que nadie conoce, generado con el mismo coste
// que los reales. Sirve para gastar el mismo tiempo cuando el correo no existe
// (ver más abajo); ninguna contraseña puede coincidir con él.
const DUMMY_PASSWORD_HASH =
  '$2b$10$cKmjD4avXM4SPTngo67AEua3Fiunl6c33naCDqDxpt4nmzInGQ0oa'

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
        // La dirección se normaliza igual que al registrarse; si no, quien se
        // dio de alta escribiendo su correo de una forma no entraría al
        // teclearlo de otra.
        const user = await prisma.user.findUnique({
          where: { email: normalizeEmail(credentials.email) },
        })

        // bcrypt.compare es el método seguro para verificar contraseñas hasheadas.
        // Nunca comparamos en texto plano porque el hash es irreversible por diseño.
        //
        // Cuando el correo no existe comparamos igualmente contra un hash de
        // relleno en lugar de salir antes. Verificar un hash cuesta unos 100 ms
        // y no hacerlo cuesta casi cero, así que sin esto el tiempo de
        // respuesta delata qué direcciones están registradas: exactamente lo
        // que el mensaje de error genérico trata de ocultar.
        const passwordMatch = await bcrypt.compare(
          credentials.password,
          user?.password ?? DUMMY_PASSWORD_HASH,
        )

        if (!user || !passwordMatch) return null

        // Cuenta sin confirmar: la comprobación va DESPUÉS de validar la
        // contraseña a propósito. Si avisáramos antes, cualquiera podría
        // averiguar qué direcciones están registradas probando correos sueltos.
        //
        // Lanzamos en lugar de devolver null para que el mensaje llegue al
        // cliente: NextAuth propaga el texto del Error en result.error, mientras
        // que null se convierte siempre en un genérico "CredentialsSignin".
        if (!user.emailVerified) {
          throw new Error('EMAIL_NOT_VERIFIED')
        }

        // Devolvemos solo los campos que necesitamos en el token/sesión.
        // Excluimos el hash de la contraseña explícitamente para que nunca
        // llegue al cliente aunque el callback jwt lo procese todo.
        return {
          id: user.id,
          email: user.email,
          // NextAuth espera un campo `name`; le damos solo el nombre de pila,
          // que es como se dirige la interfaz al trader.
          name: user.firstName,
          firstName: user.firstName,
          lastName: user.lastName,
          gender: parseGender(user.gender),
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
        // firstName y gender viajan en el token para que los componentes puedan
        // concordar los textos sin consultar la BD en cada render.
        token.firstName = user.firstName
        token.lastName = user.lastName
        token.gender = user.gender
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
        session.user.firstName = token.firstName as string
        session.user.lastName = token.lastName as string
        session.user.gender = token.gender as Gender
      }
      return session
    },
  },
}

// Re-exportamos getServerSession junto con authOptions para que los Server
// Components e API routes puedan importar ambos desde un único módulo:
//   import { getServerSession, authOptions } from '@/lib/auth'
export { getServerSession }
