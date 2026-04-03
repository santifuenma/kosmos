import Navbar from '@/components/layout/Navbar'

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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full">
        {children}
      </main>
    </div>
  )
}
