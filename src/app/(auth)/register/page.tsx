'use client'

// ─────────────────────────────────────────────────────────────────────────────
// register/page.tsx — formulario de creación de cuenta.
//
// El flujo es: validar en cliente → POST /api/auth/register → pantalla de
// "revisa tu correo". Ya no hacemos signIn automático: la cuenta nace sin
// verificar y no puede entrar hasta que el usuario pulse el enlace del correo.
//
// Validar en el cliente antes de llamar al servidor mejora la experiencia de
// usuario (feedback inmediato) aunque el servidor vuelva a validar igualmente
// por seguridad (nunca se confía solo en validaciones del cliente).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import Link from 'next/link'
import LiquidBackground from '@/components/LiquidBackground'
import AuthLogo from '@/components/AuthLogo'
import { AlertIcon, EyeIcon, EyeOffIcon, CheckCircleIcon } from '@/components/icons'
import { GENDER_OPTIONS, type Gender } from '@/lib/gender'
import { validatePassword, PASSWORD_HINT } from '@/lib/password'
import styles from './page.module.css'

export default function RegisterPage() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [gender, setGender] = useState<Gender>('UNDISCLOSED')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Cuando el registro tiene éxito sustituimos el formulario por el aviso de
  // "revisa tu correo": el usuario no puede hacer nada más hasta confirmar.
  const [registered, setRegistered] = useState(false)
  const [emailWarning, setEmailWarning] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    // Validaciones en cliente para dar feedback inmediato sin esperar al servidor.
    // El servidor las repite porque las validaciones cliente-side son bypasseables.
    if (!firstName.trim() || !lastName.trim()) {
      setError('El nombre y el apellido son obligatorios')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('El formato del email no es válido')
      return
    }
    // Misma función que usa el endpoint, así el mensaje nunca se desincroniza.
    const passwordError = validatePassword(password)
    if (passwordError) {
      setError(passwordError)
      return
    }
    // Esta validación solo tiene sentido en cliente: el servidor recibe un solo
    // campo `password` y no puede comprobar que coincida con la confirmación.
    if (password !== confirm) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        gender,
      }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Error al crear la cuenta')
      return
    }

    // La cuenta existe aunque el correo no haya salido; en ese caso avisamos y
    // dirigimos al reenvío en lugar de dejar al usuario esperando un mensaje
    // que nunca va a llegar.
    if (data.emailSent === false) {
      setEmailWarning(data.warning ?? '')
    }
    setRegistered(true)
  }

  if (registered) {
    return (
      <div className={styles.page}>
        <LiquidBackground />
        <div className={`card ${styles.card}`}>
          <AuthLogo />
          <CheckCircleIcon className={styles.successIcon} />
          <h1 className={styles.heading}>Revisa tu correo</h1>
          <p className={styles.successText}>
            Hemos enviado un enlace de confirmación a <strong>{email}</strong>.
            Pulsa el enlace para activar tu cuenta y poder iniciar sesión.
            Caduca en 24 horas.
          </p>
          {emailWarning && (
            <p className={styles.errorText} role="alert">
              <AlertIcon className={styles.errorIcon} />
              {emailWarning}
            </p>
          )}
          <p className={styles.footerText}>
            <Link href="/login" className={styles.footerLink}>
              Ir a iniciar sesión
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <LiquidBackground />
      <div className={`card ${styles.card}`}>
        <AuthLogo />
        <h1 className={styles.heading}>Crear Cuenta</h1>

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Nombre y apellido separados: la app se dirige al usuario solo por
              el nombre, así que no vale con guardarlos juntos y partirlos luego. */}
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label}>Nombre</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                maxLength={80}
                className={styles.input}
                placeholder="Tu nombre"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Apellido</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                maxLength={80}
                className={styles.input}
                placeholder="Tu apellido"
              />
            </div>
          </div>

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

          {/* El género determina la concordancia de los textos que se refieren
              al usuario (estados emocionales, bienvenida). Ver src/lib/gender.ts. */}
          <div className={styles.field}>
            <label className={styles.label}>Género</label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as Gender)}
              className={styles.input}
            >
              {GENDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className={styles.fieldHint}>
              Para dirigirnos a ti correctamente.
            </p>
          </div>

          {/* Contraseña y confirmación emparejadas. Los marcadores son puntos y
              no texto: a media anchura cualquier frase se cortaría, y las
              etiquetas ya dicen qué va en cada campo. */}
          <div className={styles.fieldRow}>
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
                  placeholder="••••••••"
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

            <div className={styles.field}>
              <label className={styles.label}>
                Confirmar
              </label>
              <div className={styles.passwordWrapper}>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className={`${styles.input} ${styles.passwordInput}`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className={styles.eyeToggle}
                  aria-label={showConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={showConfirm}
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOffIcon className={styles.eyeIcon} /> : <EyeIcon className={styles.eyeIcon} />}
                </button>
              </div>
            </div>
          </div>

          {/* La política va bajo la fila, no en un marcador: ahí se cortaba, y
              además el marcador desaparece justo cuando el usuario empieza a
              escribir, que es cuando más falta hace leerla. */}
          <p className={styles.fieldHint}>{PASSWORD_HINT}</p>

          {error && (
            <p className={styles.errorText} role="alert">
              <AlertIcon className={styles.errorIcon} />
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={styles.submitBtn}
          >
            {loading ? 'Creando cuenta...' : 'Crear Cuenta'}
          </button>
        </form>

        <p className={styles.footerText}>
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className={styles.footerLink}>
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
