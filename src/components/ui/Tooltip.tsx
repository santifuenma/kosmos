'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip — Componente de tooltip global (compartido por toda la app).
//
// Renderiza el contenido del tooltip vía React portal en `document.body`,
// así escapa del overflow / stacking context de cualquier padre
// (modales, cards con backdrop-filter, contenedores con overflow: hidden).
//
// La posición se calcula al hacer hover sobre el ícono usando
// getBoundingClientRect, y se aplica como inline style sobre un elemento
// `position: fixed` que vive directamente bajo `<body>`.
//
// Uso:
//   <Tooltip text="Texto del tooltip">
//     <InfoSvg />
//   </Tooltip>
//
//   <Tooltip text="..." position="above">
//     <InfoSvg />
//   </Tooltip>
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type TooltipProps = {
  children: ReactNode
  text: string
  position?: 'above' | 'below'
  /** Clase extra para el span wrapper (útil para márgenes/posición específicos). */
  wrapClassName?: string
}

export function Tooltip({ children, text, position = 'below', wrapClassName }: TooltipProps) {
  // `mounted` evita renderizar el portal durante SSR donde `document` no existe.
  const [mounted, setMounted] = useState(false)
  const [show, setShow] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const wrapRef = useRef<HTMLSpanElement>(null)

  useEffect(() => { setMounted(true) }, [])

  function updatePosition() {
    if (!wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    // Centrado horizontal sobre el ícono; vertical depende de `position`.
    const left = rect.left + rect.width / 2
    const top = position === 'above' ? rect.top - 10 : rect.bottom + 10
    setCoords({ top, left })
  }

  function handleEnter() {
    updatePosition()
    setShow(true)
  }

  function handleLeave() {
    setShow(false)
  }

  return (
    <>
      <span
        ref={wrapRef}
        className={wrapClassName ? `infoWrap ${wrapClassName}` : 'infoWrap'}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        <span className="infoIcon">{children}</span>
      </span>
      {mounted && show && createPortal(
        <div
          className="tooltipFloat"
          style={{
            top: coords.top,
            left: coords.left,
            // En `above` la transformación nos da el efecto "arriba del icono":
            // -50% en X centra horizontalmente, -100% en Y sube el tooltip
            // por encima del punto de anclaje (rect.top - 10).
            transform: position === 'above'
              ? 'translate(-50%, -100%)'
              : 'translate(-50%, 0)',
          }}
        >
          {text}
        </div>,
        document.body,
      )}
    </>
  )
}
