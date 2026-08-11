import { redirect } from 'next/navigation'
import { getServerSession, authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Navbar from '@/components/layout/Navbar'
import LiquidBackground from '@/components/LiquidBackground'
import OnboardingFlow from '@/components/onboarding/OnboardingFlow'
import styles from './layout.module.css'

// ─────────────────────────────────────────────────────────────────────────────
// Layout de la zona protegida de la aplicación.
//
// Este layout anidado aplica la Navbar a todas las páginas del grupo (app):
// dashboard, strategy, session y history. Las páginas de auth (login/register)
// usan su propio grupo (auth) y no heredan este layout.
//
// No necesita SessionProvider porque ya está en el layout raíz (src/app/layout.tsx).
//
// ── Puerta de onboarding ────────────────────────────────────────────────────
// Si el usuario todavía no tiene estrategia, renderiza el onboarding en lugar
// de `children`. Al vivir en el layout y no en una página concreta cubre todas
// las rutas del grupo: escribir /history o /session/new a mano tampoco lo salta.
//
// La ausencia de estrategia es la señal de "usuario nuevo" y evita añadir un
// campo extra en User: la estrategia es obligatoria para operar de todos modos
// (el ICO se calcula contra sus reglas y condiciones), así que ambos estados
// coinciden siempre.
//
// Esta comprobación no puede hacerse en el proxy (src/proxy.ts): corre en el
// Edge Runtime, donde no hay acceso a Prisma.
// ─────────────────────────────────────────────────────────────────────────────
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  // select mínimo: solo interesa si existe, no sus datos.
  const strategy = await prisma.strategy.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })

  // El onboarding no usa el shell de la app (styles.appLayout reserva el hueco
  // del sidebar): ocupa el viewport entero y no hay Navbar que mostrar todavía.
  if (!strategy) {
    return (
      <>
        <LiquidBackground />
        <OnboardingFlow />
      </>
    )
  }

  return (
    <div className={styles.appLayout}>
      <LiquidBackground />
      <Navbar>{children}</Navbar>
    </div>
  )
}
