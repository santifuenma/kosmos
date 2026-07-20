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
import LiquidBackground from '@/components/LiquidBackground'
import AuthLogo from '@/components/AuthLogo'
import { AlertIcon, EyeIcon, EyeOffIcon } from '@/components/icons'
import styles from './page.module.css'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Cuenta correcta pero sin confirmar: en vez del error genérico mostramos el
  // motivo real y ofrecemos reenviar el correo.
  const [unverified, setUnverified] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendMessage, setResendMessage] = useState('')

  async function handleResend() {
    setResending(true)
    const res = await fetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await res.json().catch(() => ({}))
    setResendMessage(data.message ?? 'Si esa cuenta existe, le hemos enviado un enlace nuevo.')
    setResending(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setUnverified(false)
    setResendMessage('')
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
      // authorize() solo lanza EMAIL_NOT_VERIFIED cuando la contraseña ya se ha
      // validado, así que revelar el motivo aquí no permite enumerar cuentas:
      // quien ve este mensaje ya conocía las credenciales.
      if (result.error.includes('EMAIL_NOT_VERIFIED')) {
        setUnverified(true)
        return
      }
      // Para el resto no distinguimos entre "email no encontrado" y "contraseña
      // incorrecta" intencionadamente: un mensaje genérico dificulta la
      // enumeración de cuentas existentes a un posible atacante.
      setError('Email o contraseña incorrectos')
      return
    }

    // signIn() ya dejó la cookie de sesión establecida antes de resolver,
    // así que router.push('/dashboard') provoca un render fresco del Server
    // Component que lee esa cookie nueva. NO añadimos router.refresh() aquí:
    // encadenado tras el push forzaba un SEGUNDO render completo del dashboard
    // (con sus 4 consultas a BD repetidas), duplicando la latencia del login.
    router.push('/dashboard')
  }

  return (
    <div className={styles.page}>
      <LiquidBackground />
      <div className={`card ${styles.card}`}>
        <AuthLogo />
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
            <div className={styles.passwordWrapper}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={`${styles.input} ${styles.passwordInput}`}
                placeholder="••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className={styles.eyeToggle}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={showPassword}
                tabIndex={-1}
              >
                {showPassword ? <EyeOffIcon className={styles.eyeIcon} /> : <EyeIcon className={styles.eyeIcon} />}
              </button>
            </div>
          </div>

          {/* Mostramos el error solo cuando existe, sin reservar espacio vacío */}
          {error && (
            <p className={styles.errorText} role="alert">
              <AlertIcon className={styles.errorIcon} />
              {error}
            </p>
          )}

          {/* Credenciales correctas pero cuenta sin confirmar */}
          {unverified && (
            <div className={styles.unverifiedBox} role="alert">
              <p className={styles.unverifiedText}>
                Tu cuenta todavía no está confirmada. Revisa tu correo y pulsa el
                enlace que te enviamos.
              </p>
              {resendMessage ? (
                <p className={styles.unverifiedNotice}>{resendMessage}</p>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className={styles.resendBtn}
                >
                  {resending ? 'Enviando...' : 'Reenviarme el enlace'}
                </button>
              )}
            </div>
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
