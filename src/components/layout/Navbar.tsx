'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { TodayIntention } from '@/types'
import styles from './Navbar.module.css'

// ── Inline SVG icons ──────────────────────────────────────────────────────────

// Logotipo de Kosmos: anillo (SVG) + estrella (PNG) superpuestos.
// Cada `Image` se posiciona en absoluto vía CSS (logoRing/logoStar) dentro del
// contenedor `.logoMark` (40×39px). Usamos `fill` para que next/image respete
// ese tamaño manteniendo las optimizaciones de carga.
function KosmosIcon() {
  return (
    <span className={styles.logoMark} aria-hidden="true">
      <Image src="/kosmos-ring.svg" alt="" fill className={styles.logoRing} />
      <Image src="/kosmos-star.png" alt="" fill className={styles.logoStar} />
    </span>
  )
}

function HomeIcon() {
  return (
    <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9.5z" />
      <path d="M9 21V13h6v8" />
    </svg>
  )
}

function TargetIcon() {
  return (
    <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

function CandlesIcon() {
  return (
    <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <rect x="3" y="8" width="4" height="7" rx="0.5" />
      <line x1="5" y1="5" x2="5" y2="8" />
      <line x1="5" y1="15" x2="5" y2="18" />
      <rect x="10" y="5" width="4" height="9" rx="0.5" />
      <line x1="12" y1="3" x2="12" y2="5" />
      <line x1="12" y1="14" x2="12" y2="19" />
      <rect x="17" y="7" width="4" height="6" rx="0.5" />
      <line x1="19" y1="4" x2="19" y2="7" />
      <line x1="19" y1="13" x2="19" y2="17" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M4 11h16" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg className={styles.logoutIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Navbar() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [todayIntention, setTodayIntention] = useState<TodayIntention | null | undefined>(undefined)

  // Close sidebar whenever the route changes (user tapped a link).
  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  useEffect(() => {
    fetch('/api/intention')
      .then((res) => {
        if (res.status === 404) { setTodayIntention(null); return }
        return res.json().then((data: TodayIntention) => setTodayIntention(data))
      })
      .catch(() => setTodayIntention(null))
  }, [pathname])

  const hasOpenSession =
    todayIntention?.confirmedAt !== null &&
    todayIntention?.confirmedAt !== undefined &&
    todayIntention?.session?.status === 'OPEN'

  const hasClosedSession =
    todayIntention?.session?.status === 'CLOSED' &&
    todayIntention?.session?.id

  const sessionHref = hasOpenSession
    ? '/session/active'
    : hasClosedSession
      ? `/session/${todayIntention!.session!.id}`
      : '/session/new'

  const navLinks = [
    { href: '/dashboard',  label: 'Dashboard',  icon: <HomeIcon /> },
    { href: '/strategy',   label: 'Estrategia', icon: <TargetIcon /> },
    { href: sessionHref,   label: 'Sesión',      icon: <CandlesIcon />, isSession: true },
    { href: '/history',    label: 'Historial',   icon: <CalendarIcon /> },
    { href: '/profile',    label: 'Perfil',      icon: <UserIcon />, disabled: true },
  ]

  // Determine the active page's icon for the mobile pill.
  const activeLink = navLinks.find(({ href, isSession }) =>
    href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname.startsWith(isSession ? '/session' : href),
  )

  return (
    <>
      {/* ── Mobile pill (visible only ≤ 450px via CSS) ─────────────────────── */}
      <button
        className={`${styles.mobilePill} ${isOpen ? styles.mobilePillHidden : ''}`}
        onClick={() => setIsOpen(true)}
        aria-label="Abrir menú"
      >
        {activeLink?.icon ?? <HomeIcon />}
      </button>

      {/* ── Overlay (visible when sidebar open on mobile) ──────────────────── */}
      <div
        className={`${styles.overlay} ${isOpen ? styles.overlayVisible : ''}`}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarInner}>

          {/* Logo */}
          <Link href="/dashboard" className={styles.logo} aria-label="Dashboard">
            <span className={styles.logoText}>KOSMOS</span>
            <span className={styles.logoIcon}><KosmosIcon /></span>
          </Link>

          {/* Nav items */}
          <nav className={styles.nav}>
            {navLinks.map(({ href, label, icon, isSession, disabled }) => {
              const isActive =
                href === '/dashboard'
                  ? pathname === '/dashboard'
                  : pathname.startsWith(isSession ? '/session' : href)

              if (disabled) {
                return (
                  <span
                    key={href}
                    className={`${styles.navLink} ${styles.navLinkDisabled}`}
                    title={label}
                  >
                    {icon}
                    <span className={styles.navLabel}>{label}</span>
                  </span>
                )
              }

              return (
                <Link
                  key={href}
                  href={href}
                  className={isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
                  title={label}
                >
                  {icon}
                  <span className={styles.navLabel}>{label}</span>
                  {isSession && hasOpenSession && (
                    <span className={styles.sessionDot} />
                  )}
                </Link>
              )
            })}
          </nav>

          {/* Cerrar sesión */}
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className={styles.logoutBtn}
            title="Cerrar sesión"
          >
            <LogoutIcon />
            <span className={styles.logoutLabel}>Cerrar sesión</span>
          </button>

        </div>
      </aside>

      {/* Confirm dialog para logout */}
      <ConfirmDialog
        open={showLogoutConfirm}
        title="¿Cerrar sesión?"
        message="Se cerrará tu sesión de cuenta. Tendrás que volver a iniciar sesión para acceder a KOSMOS."
        confirmLabel="Cerrar sesión"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={() => signOut({ callbackUrl: '/login' })}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </>
  )
}
