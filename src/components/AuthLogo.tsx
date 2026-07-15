// ─────────────────────────────────────────────────────────────────────────────
// AuthLogo.tsx — logotipo de Kosmos para las pantallas de autenticación.
//
// Reutiliza el mismo mark que el Navbar (anillo SVG + estrella PNG superpuestos)
// acompañado del wordmark "KOSMOS". Se comparte entre las pantallas de login y
// registro para que ambas mantengan exactamente la misma cabecera de marca.
// ─────────────────────────────────────────────────────────────────────────────

import Image from 'next/image'
import styles from './AuthLogo.module.css'

export default function AuthLogo() {
  return (
    <div className={styles.logo}>
      <Image src="/kosmos-logo.svg" alt="Kosmos" width={319} height={82} priority className={styles.word} />
    </div>
  )
}
