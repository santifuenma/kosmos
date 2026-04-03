'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'

// ─────────────────────────────────────────────────────────────────────────────
// Navbar — barra de navegación para todas las páginas protegidas.
//
// Es un Client Component porque:
//  1. Necesita useSession() para mostrar el nombre del usuario
//  2. Necesita signOut() para cerrar sesión
//  3. Necesita usePathname() para destacar el enlace activo
// ─────────────────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/strategy', label: 'Estrategia' },
  { href: '/session/new', label: 'Nueva Sesión' },
  { href: '/history', label: 'Historial' },
]

export default function Navbar() {
  const { data: session } = useSession()
  const pathname = usePathname()

  return (
    <nav className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between h-14">
        {/* Logo / nombre de la app */}
        <Link
          href="/dashboard"
          className="text-xl font-bold text-gray-900 tracking-tight"
        >
          KOSMOS
        </Link>

        {/* Links de navegación principal */}
        <div className="hidden sm:flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => {
            // Marcamos como activo si el pathname empieza por el href del link.
            // Excluimos /dashboard del prefijo para que no se active en todos los casos.
            const isActive =
              href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(href)

            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </div>

        {/* Usuario + botón de logout */}
        <div className="flex items-center gap-3">
          {session?.user?.name && (
            <span className="hidden sm:block text-sm text-gray-600">
              {session.user.name}
            </span>
          )}
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </nav>
  )
}
