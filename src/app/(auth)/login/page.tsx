'use client'

// ─────────────────────────────────────────────────────────────────────────────
// login/page.tsx — formulario de inicio de sesión.
//
// Es un Client Component porque gestiona estado del formulario e interactúa
// con NextAuth desde el cliente. La autenticación se delega completamente a
// NextAuth: nosotros solo recogemos las credenciales y llamamos a `signIn`.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import styles from './page.module.css'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    // `redirect: false` evita que NextAuth haga una redirección de página
    // completa tras el login. Preferimos gestionar nosotros la navegación
    // para poder mostrar errores de forma controlada antes de redirigir.
    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      // No distinguimos entre "email no encontrado" y "contraseña incorrecta"
      // intencionadamente: un mensaje genérico dificulta la enumeración de
      // cuentas existentes a un posible atacante.
      setError('Email o contraseña incorrectos')
      return
    }

    // router.refresh() fuerza a Next.js a revalidar los Server Components
    // de la nueva ruta con la sesión ya establecida. Sin él, el dashboard
    // podría renderizarse con datos de sesión desactualizados.
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.heading}>Iniciar Sesión</h1>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={styles.input}
              placeholder="tu@email.com"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={styles.input}
              placeholder="••••••"
            />
          </div>

          {/* Mostramos el error solo cuando existe, sin reservar espacio vacío */}
          {error && (
            <p className={styles.errorText}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={styles.submitBtn}
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
          </button>
        </form>

        <p className={styles.footerText}>
          ¿No tienes cuenta?{' '}
          <Link href="/register" className={styles.footerLink}>
            Regístrate
          </Link>
        </p>
      </div>
    </div>
  )
}
