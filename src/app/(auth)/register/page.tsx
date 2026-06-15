'use client'

// ─────────────────────────────────────────────────────────────────────────────
// register/page.tsx — formulario de creación de cuenta.
//
// El flujo es: validar en cliente → POST /api/auth/register → signIn automático.
// Validar en el cliente antes de llamar al servidor mejora la experiencia de
// usuario (feedback inmediato) aunque el servidor vuelva a validar igualmente
// por seguridad (nunca se confía solo en validaciones del cliente).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import styles from './page.module.css'

export default function RegisterPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    // Validaciones en cliente para dar feedback inmediato sin esperar al servidor.
    // El servidor las repite porque las validaciones cliente-side son bypasseables.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('El formato del email no es válido')
      return
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }
    // Esta validación solo tiene sentido en cliente: el servidor recibe un solo
    // campo `password` y no puede comprobar que coincida con la confirmación.
    if (password !== confirm) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)

    // name.trim() || undefined: si el nombre está vacío enviamos undefined para
    // que el servidor lo trate como campo no enviado y lo guarde como null.
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name: name.trim() || undefined }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Error al crear la cuenta')
      setLoading(false)
      return
    }

    // Login automático tras registro exitoso: mejora la experiencia evitando
    // que el usuario tenga que volver a introducir sus credenciales en /login.
    // Usamos las mismas credenciales que acaba de registrar.
    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      // El registro fue exitoso pero el login falló (caso muy improbable).
      // Informamos sin redirigir para que el usuario intente hacer login manualmente.
      setError('Cuenta creada, pero no se pudo iniciar sesión automáticamente')
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.heading}>Crear Cuenta</h1>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>
              Nombre <span className={styles.optional}>(opcional)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={styles.input}
              placeholder="Tu nombre"
            />
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
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              Confirmar Contraseña
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className={styles.input}
              placeholder="Repite la contraseña"
            />
          </div>

          {error && (
            <p className={styles.errorText}>{error}</p>
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
