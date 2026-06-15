import Navbar from '@/components/layout/Navbar'
import styles from './layout.module.css'

// ─────────────────────────────────────────────────────────────────────────────
// Layout de la zona protegida de la aplicación.
//
// Este layout anidado aplica la Navbar a todas las páginas del grupo (app):
// dashboard, strategy, session y history. Las páginas de auth (login/register)
// usan su propio grupo (auth) y no heredan este layout.
//
// No necesita SessionProvider porque ya está en el layout raíz (src/app/layout.tsx).
// ─────────────────────────────────────────────────────────────────────────────
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.appLayout}>
      <Navbar />
      <main className={styles.main}>
        {children}
      </main>
    </div>
  )
}
