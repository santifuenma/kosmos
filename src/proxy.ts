import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl
    const token = req.nextauth.token

    // Usuario autenticado intenta acceder a login/register → dashboard
    if (token && (pathname === '/login' || pathname === '/register')) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      // authorized devuelve true → ejecutar middleware; false → redirigir a signIn
      authorized({ token, req }) {
        const { pathname } = req.nextUrl

        // Rutas públicas: siempre autorizadas
        if (
          pathname === '/login' ||
          pathname === '/register' ||
          pathname.startsWith('/api/auth')
        ) {
          return true
        }

        // El resto requiere token
        return !!token
      },
    },
  },
)

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
