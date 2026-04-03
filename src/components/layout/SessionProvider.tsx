'use client'

// ─────────────────────────────────────────────────────────────────────────────
// SessionProvider.tsx — wrapper cliente del proveedor de sesión de NextAuth.
//
// El `SessionProvider` de `next-auth/react` usa el contexto de React para
// exponer la sesión a todos los Client Components que llamen a `useSession()`.
// Sin él, los hooks de NextAuth no funcionan en el App Router.
//
// Necesita ser un Client Component (`'use client'`) porque usa Context de React,
// que no está disponible en Server Components. Sin embargo, sus hijos pueden
// ser Server Components: Next.js renderiza el árbol en el servidor y solo
// hidrata la parte cliente en el navegador.
//
// Envuelve este provider en un componente propio para que el layout raíz
// (Server Component) pueda importarlo sin convertirse él mismo en cliente.
// ─────────────────────────────────────────────────────────────────────────────

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react'

export default function SessionProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>
}
