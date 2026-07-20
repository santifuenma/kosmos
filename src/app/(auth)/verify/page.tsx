'use client'

// ─────────────────────────────────────────────────────────────────────────────
// verify/page.tsx — destino del enlace del correo de confirmación.
//
// Lee el token de la query, lo canjea contra /api/auth/verify y muestra el
// resultado. Cada desenlace ofrece la salida que corresponde: entrar si se
// confirmó, pedir un enlace nuevo si caducó, o volver al registro si no vale.
//
// La verificación se dispara desde un efecto y no en el servidor a propósito:
// algunos clientes de correo y antivirus "pre-visitan" los enlaces recibidos, y
// si el consumo del token ocurriese en un GET del servidor esos escaneos
// activarían la cuenta antes de que el usuario llegase a pulsar nada.
// ─────────────────────────────────────────────────────────────────────────────

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import LiquidBackground from '@/components/LiquidBackground'
import AuthLogo from '@/components/AuthLogo'
import { AlertIcon, CheckCircleIcon } from '@/components/icons'
import styles from './page.module.css'

type Status = 'loading' | 'verified' | 'already' | 'expired' | 'invalid'

function VerifyContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  // El caso "sin token" se conoce ya en el primer render, así que sale del
  // estado inicial en vez de un setState dentro del efecto: no hay que
  // renderizar un "cargando" que nunca va a resolverse.
  const [status, setStatus] = useState<Status>(token ? 'loading' : 'invalid')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState(
    token ? '' : 'El enlace no incluye ningún código de confirmación.',
  )
  const [resending, setResending] = useState(false)
  const [resendMessage, setResendMessage] = useState('')

  // En desarrollo React monta los efectos dos veces; sin esta guarda el token se
  // canjearía por duplicado y la segunda llamada devolvería "ya usado".
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current) return
    attempted.current = true

    // Sin token no hay nada que canjear; el estado ya se inicializó a 'invalid'.
    if (!token) return

    fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => ({ ok: res.ok, data: await res.json() }))
      .then(({ data }) => {
        setEmail(data.email ?? '')
        setMessage(data.error ?? '')
        if (data.reason === 'VERIFIED') setStatus('verified')
        else if (data.reason === 'ALREADY_VERIFIED') setStatus('already')
        else if (data.reason === 'EXPIRED') setStatus('expired')
        else setStatus('invalid')
      })
      .catch(() => {
        setStatus('invalid')
        setMessage('No pudimos comprobar el enlace. Inténtalo de nuevo.')
      })
  }, [token])

  async function handleResend() {
    if (!email) return
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

  return (
    <div className={styles.page}>
      <LiquidBackground />
      <div className={`card ${styles.card}`}>
        <AuthLogo />

        {status === 'loading' && (
          <>
            <h1 className={styles.heading}>Confirmando tu cuenta...</h1>
            <p className={styles.text}>Un momento.</p>
          </>
        )}

        {status === 'verified' && (
          <>
            <CheckCircleIcon className={styles.successIcon} />
            <h1 className={styles.heading}>Cuenta confirmada</h1>
            <p className={styles.text}>
              Ya puedes iniciar sesión{email && <> con <strong>{email}</strong></>} y
              definir tu estrategia.
            </p>
            <Link href="/login" className={styles.primaryBtn}>
              Iniciar sesión
            </Link>
          </>
        )}

        {status === 'already' && (
          <>
            <CheckCircleIcon className={styles.successIcon} />
            <h1 className={styles.heading}>Esta cuenta ya estaba confirmada</h1>
            <p className={styles.text}>No hace falta hacer nada más.</p>
            <Link href="/login" className={styles.primaryBtn}>
              Iniciar sesión
            </Link>
          </>
        )}

        {status === 'expired' && (
          <>
            <AlertIcon className={styles.warningIcon} />
            <h1 className={styles.heading}>El enlace ha caducado</h1>
            <p className={styles.text}>
              Los enlaces de confirmación duran 24 horas. Te enviamos uno nuevo
              {email && <> a <strong>{email}</strong></>}.
            </p>
            {resendMessage ? (
              <p className={styles.noticeText}>{resendMessage}</p>
            ) : (
              <button onClick={handleResend} disabled={resending} className={styles.primaryBtn}>
                {resending ? 'Enviando...' : 'Enviarme un enlace nuevo'}
              </button>
            )}
          </>
        )}

        {status === 'invalid' && (
          <>
            <AlertIcon className={styles.warningIcon} />
            <h1 className={styles.heading}>Enlace no válido</h1>
            <p className={styles.text}>
              {message || 'Este enlace no es válido o ya se ha usado.'}
            </p>
            <Link href="/login" className={styles.primaryBtn}>
              Ir a iniciar sesión
            </Link>
          </>
        )}

        <p className={styles.footerText}>
          ¿Problemas?{' '}
          <Link href="/register" className={styles.footerLink}>
            Crear una cuenta nueva
          </Link>
        </p>
      </div>
    </div>
  )
}

// useSearchParams obliga a un límite de Suspense para que Next pueda prerenderizar
// el resto de la página sin esperar a la query.
export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyContent />
    </Suspense>
  )
}
