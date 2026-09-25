// ─────────────────────────────────────────────────────────────────────────────
// proxy.ts — capa de protección de rutas de la aplicación.
//
// En Next.js 16 el fichero de middleware se llama `proxy.ts` (antes era
// `middleware.ts`). Se ejecuta en el Edge Runtime antes de que cualquier
// página o API route procese la petición, lo que lo convierte en el lugar
// ideal para redirigir usuarios no autenticados sin renderizar la página.
//
// Usamos `withAuth` de NextAuth, que gestiona la lectura del token JWT y
// expone `req.nextauth.token` dentro de la función de middleware.
//
// Flujo de autenticación:
//  1. Petición llega → se evalúa el callback `authorized`
//  2. Si `authorized` devuelve false → NextAuth redirige a `signIn` (/login)
//  3. Si `authorized` devuelve true → se ejecuta la función `middleware`
//  4. `middleware` puede hacer redirecciones adicionales (ej: usuario ya logueado
//     intentando acceder a /login → lo mandamos al /dashboard)
// ─────────────────────────────────────────────────────────────────────────────

import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'
import { isDemoUser } from '@/lib/demo'

// Métodos HTTP que por definición no cambian nada.
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl
    const token = req.nextauth.token

    // Si un usuario ya autenticado intenta acceder a /login o /register,
    // lo redirigimos al dashboard. Evita que el formulario de login sea
    // accesible una vez dentro de la aplicación.
    if (token && (pathname === '/login' || pathname === '/register')) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }

    // ── Demo público: solo lectura ─────────────────────────────────────────
    // Cualquier petición a la API que no sea de lectura se corta aquí. No es
    // la única barrera: las rutas consultan en nombre del demo con el rol
    // kosmos_demo, que en Postgres no tiene permiso para escribir. Esto
    // sirve para que la respuesta sea un 403 claro en vez de un error de
    // base de datos, y para que la petición no llegue ni a ejecutarse.
    //
    // /api/auth queda fuera porque es donde se cierra la sesión, y ninguna de
    // sus rutas toca los datos del demo.
    if (
      isDemoUser(token?.email) &&
      pathname.startsWith('/api/') &&
      !pathname.startsWith('/api/auth/') &&
      !READ_METHODS.has(req.method)
    ) {
      return NextResponse.json(
        { error: 'El demo es de solo lectura' },
        { status: 403 },
      )
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      // `authorized` determina si la petición puede continuar.
      // Devolver `true` permite que el middleware se ejecute.
      // Devolver `false` dispara la redirección automática de NextAuth a /login.
      authorized({ token, req }) {
        const { pathname } = req.nextUrl

        // Las páginas de auth y los endpoints de NextAuth/registro son públicos.
        // Si no los excluimos aquí, los usuarios no autenticados no podrían
        // ni siquiera acceder a /login para introducir sus credenciales.
        //
        // /verify va en la lista porque es el destino del enlace de confirmación
        // del correo: por definición quien lo abre todavía no puede autenticarse,
        // así que exigirle sesión haría imposible confirmar la cuenta.
        if (
          pathname === '/login' ||
          pathname === '/register' ||
          pathname === '/verify' ||
          pathname.startsWith('/api/auth')
        ) {
          return true
        }

        // Cualquier otra ruta requiere un token válido.
        // !!token convierte el token (objeto o null) a booleano.
        return !!token
      },
    },
  },
)

export const config = {
  // Aplicamos el proxy a todas las rutas excepto:
  //  - Archivos estáticos de Next.js (_next/static, _next/image)
  //  - favicon.ico
  //  - Imágenes (svg, png, jpg, jpeg, gif, webp)
  // Si no los excluyéramos, cada imagen cargada en la página pasaría por
  // la lógica de autenticación innecesariamente.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
