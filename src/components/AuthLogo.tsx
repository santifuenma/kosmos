// ─────────────────────────────────────────────────────────────────────────────
// AuthLogo.tsx — logotipo de Kosmos para las pantallas de autenticación.
//
// Reutiliza el mismo mark que el Navbar (anillo SVG + estrella PNG superpuestos)
// acompañado del wordmark "KOSMOS". Se comparte entre las pantallas de login y
// registro para que ambas mantengan exactamente la misma cabecera de marca.
// ─────────────────────────────────────────────────────────────────────────────

import styles from './AuthLogo.module.css'

export default function AuthLogo() {
  return (
    <div className={styles.logo}>
      <span className={styles.word}>KOSMOS</span>
    </div>
  )
}
