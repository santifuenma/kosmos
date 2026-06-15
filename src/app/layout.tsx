// ─────────────────────────────────────────────────────────────────────────────
// layout.tsx (raíz) — layout global que envuelve toda la aplicación.
//
// Este es el único lugar donde montamos el SessionProvider de NextAuth.
// Lo ponemos aquí, en el layout raíz, para que tanto las páginas protegidas
// (grupo `(app)`) como las páginas de autenticación (grupo `(auth)`) tengan
// acceso a la sesión mediante `useSession()`. Si lo pusiéramos solo en el
// layout de `(app)`, la página de login no podría detectar que el usuario
// ya está logueado y redirigirle al dashboard.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import SessionProvider from '@/components/layout/SessionProvider'

// Fuentes de Vercel/Google optimizadas para Next.js.
// Se cargan con CSS variables para poder usarlas desde Tailwind.
const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Kosmos',
  description: 'Plataforma de análisis conductual para traders',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        {/* SessionProvider convierte la sesión JWT en contexto React accesible
            desde cualquier Client Component sin necesidad de prop drilling. */}
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
