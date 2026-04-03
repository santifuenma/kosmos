// ─────────────────────────────────────────────────────────────────────────────
// page.tsx (ruta raíz "/") — punto de entrada de la aplicación.
//
// La URL raíz no tiene contenido propio: su único propósito es redirigir
// al usuario al destino correcto según su estado de autenticación.
// Así evitamos mostrar una página en blanco o el landing de Next.js por defecto.
//
// Es un Server Component para poder leer la sesión en servidor antes de
// responder, evitando el parpadeo que causaría una redirección client-side.
// ─────────────────────────────────────────────────────────────────────────────

import { redirect } from 'next/navigation'
import { getServerSession, authOptions } from '@/lib/auth'

export default async function RootPage() {
  const session = await getServerSession(authOptions)

  // Si hay sesión activa → dashboard; si no → login.
  // El proxy (proxy.ts) también protege las rutas, pero hacer la redirección
  // aquí da una respuesta más directa en lugar de pasar por el middleware.
  redirect(session ? '/dashboard' : '/login')
}
