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

  // Si hay sesión activa → dashboard; si no → demo público.
  //
  // Quien llega a la raíz sin sesión casi siempre viene del portfolio o de un
  // enlace compartido: lo llevamos directo al demo en vez de pedirle una
  // cuenta que no tiene. Los usuarios reales entran por /login como siempre
  // (el proxy sigue mandando allí a quien pida cualquier otra página sin
  // sesión).
  redirect(session ? '/dashboard' : '/api/demo-login')
}
