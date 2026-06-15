'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ConfirmDialog — modal de confirmación reutilizable.
//
// Usa las clases globales de globals.css (confirmOverlay, confirmPanel, ctaBtn).
// Soporta animación de entrada y salida con desmontaje diferido.
//
// Uso:
//   <ConfirmDialog
//     open={showConfirm}
//     icon="⚠️"
//     title="¿Cerrar sesión?"
//     message="Perderás acceso hasta volver a iniciar sesión."
//     confirmLabel="Cerrar sesión"
//     cancelLabel="Cancelar"
//     variant="danger"
//     onConfirm={handleLogout}
//     onCancel={() => setShowConfirm(false)}
//   />
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'

type ConfirmDialogProps = {
  open: boolean
  icon?: string
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** 'danger' usa botón rojo; 'warning' usa botón amarillo; default usa neutral. */
  variant?: 'danger' | 'warning' | 'neutral'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  icon,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'neutral',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // `visible` mantiene el componente montado mientras corre la animación de salida.
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (open) {
      setVisible(true)
      setClosing(false)
    } else if (visible) {
      // open pasó a false → arrancar animación de salida
      setClosing(true)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnimEnd = useCallback(
    (e: React.AnimationEvent) => {
      if (closing && e.currentTarget === e.target) {
        setVisible(false)
        setClosing(false)
      }
    },
    [closing],
  )

  if (!visible) return null

  const confirmBtnClass =
    variant === 'danger'
      ? 'ctaBtn ctaBtnSecondary ctaBtnDanger'
      : variant === 'warning'
        ? 'ctaBtn ctaBtnSecondary ctaBtnWarning'
        : 'ctaBtn ctaBtnSecondary'

  return (
    <div className={`confirmOverlay ${closing ? 'confirmOverlayClosing' : ''}`}>
      <div
        className={`confirmPanel ${closing ? 'confirmPanelClosing' : ''}`}
        onAnimationEnd={handleAnimEnd}
      >
        {icon && <div className="confirmIcon">{icon}</div>}
        <h3 className="confirmTitle">{title}</h3>
        <p className="confirmMessage">{message}</p>
        <div className="confirmActions">
          <button className="ctaBtn ctaBtnSecondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={confirmBtnClass} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
