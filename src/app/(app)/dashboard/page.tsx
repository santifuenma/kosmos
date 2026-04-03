import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getServerSession, authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard — página de inicio tras el login.
//
// Es un Server Component para poder consultar la base de datos directamente
// sin exponer datos sensibles al cliente. Comprobamos si el usuario tiene
// estrategia configurada porque sin ella no puede operar en la plataforma.
// ─────────────────────────────────────────────────────────────────────────────
export default async function DashboardPage() {
  const session = await getServerSession(authOptions)

  // La sesión siempre debería existir aquí porque el proxy (middleware) protege
  // esta ruta, pero lo comprobamos igualmente por robustez.
  if (!session?.user?.id) redirect('/login')

  // Comprobamos si el usuario tiene estrategia. Solo necesitamos saber si existe,
  // por eso usamos select con solo el id para minimizar los datos transferidos.
  const strategy = await prisma.strategy.findUnique({
    where: { userId: session.user.id },
    select: { id: true, name: true },
  })

  const userName = session.user.name ?? session.user.email ?? 'Trader'

  return (
    <div className="space-y-6">
      {/* Cabecera de bienvenida */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Hola, {userName}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {new Date().toLocaleDateString('es-ES', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>

      {/* Estado: sin estrategia → bloqueado hasta que la configure */}
      {!strategy ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-amber-800">
            Configura tu estrategia para empezar
          </h2>
          <p className="mt-2 text-sm text-amber-700">
            Antes de declarar intenciones diarias y registrar sesiones necesitas
            definir tu estrategia operativa: las condiciones que deben cumplirse
            para entrar en una operación y las reglas conductuales que te
            comprometes a seguir.
          </p>
          <Link
            href="/strategy"
            className="mt-4 inline-block bg-amber-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-amber-700 transition-colors"
          >
            Crear mi estrategia →
          </Link>
        </div>
      ) : (
        /* Estado: con estrategia → dashboard operativo (se completará en siguientes prompts) */
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900">
            Estrategia activa: {strategy.name}
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            El dashboard operativo estará disponible próximamente.
            Puedes{' '}
            <Link href="/strategy" className="text-blue-600 hover:underline">
              revisar tu estrategia
            </Link>{' '}
            o empezar una nueva sesión.
          </p>
        </div>
      )}
    </div>
  )
}
