'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Tooltip } from '@/components/ui/Tooltip'
import styles from './TradesTable.module.css'

type TradeViolation = {
  id: string
  type: string
  condition?: { label: string } | null
  rule?: { label: string } | null
}

type Trade = {
  id: string
  direction: string
  asset?: string | null
  result: string
  pnlAmount?: number | null
  violations: TradeViolation[]
  notes?: string | null
  timestamp?: string | Date
  createdAt?: string | Date
}

type TradesTableProps = {
  trades: Trade[]
  variant?: 'static' | 'interactive'
  showTotal?: boolean
}

export function TradesTable({ trades, variant = 'static', showTotal = false }: TradesTableProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const hoveredTrade = trades.find((t) => t.id === hoveredId) ?? null

  function handleRowEnter(id: string, e: React.MouseEvent<HTMLTableRowElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltipPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 })
    setHoveredId(id)
  }

  function handleRowLeave() {
    setHoveredId(null)
    setTooltipPos(null)
  }

  const totalPnl = trades.reduce((sum, t) => sum + (t.pnlAmount ?? 0), 0)

  // ── Igualar ancho de badges PnL y violación (static) ────────────────────
  const pnlRefs = useRef<(HTMLElement | null)[]>([])
  const violRefs = useRef<(HTMLElement | null)[]>([])

  useLayoutEffect(() => {
    if (variant !== 'static') return

    const equalize = (refs: (HTMLElement | null)[]) => {
      const els = refs.filter(Boolean) as HTMLElement[]
      if (els.length === 0) return
      els.forEach((el) => { el.style.minWidth = '0px' })
      void els[0].offsetWidth
      const widths = els.map((el) => el.getBoundingClientRect().width)
      const maxW = Math.ceil(Math.max(...widths))
      els.forEach((el) => { el.style.minWidth = `${maxW}px` })
    }

    equalize(pnlRefs.current)
    equalize(violRefs.current)
  })

  if (trades.length === 0) {
    return <p className={styles.empty}>
      {variant === 'interactive' ? 'Aún no has registrado ninguna operación.' : 'No se registraron trades'}
    </p>
  }

  // ── Limpiar refs antes de cada render ─────────────────────────────────
  pnlRefs.current = []
  violRefs.current = []

  // ── Static variant ──────────────────────────────────────────────────────
  if (variant === 'static') {
    const hasTotalRow = showTotal && trades.some((t) => t.pnlAmount !== null)

    return (
      <div className={styles.staticWrap}>
        <table className={styles.staticTable}>
          <thead>
            <tr>
              <th><p>#</p></th>
              <th><p><span className={styles.colFull}>Dirección</span><span className={styles.colShort}>Dir.</span></p></th>
              <th><p>Activo</p></th>
              <th><p>Violación</p></th>
              <th><p>Resultado</p></th>
              <th><p>PnL</p></th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, i) => {
              const vCount = trade.violations.length
              const pnl = trade.pnlAmount
              return (
                <tr key={trade.id} className={styles.staticRow}>
                  <td><p>{i + 1}</p></td>
                  <td>
                    <p className={trade.direction === 'LONG' ? styles.dirLong : styles.dirShort}>
                      {trade.direction === 'LONG' ? 'Long' : 'Short'}
                    </p>
                  </td>
                  <td><p>{trade.asset ?? '—'}</p></td>
                  <td>
                    {vCount > 0 ? (
                      <Tooltip
                        wrapClassName={styles.violationTooltipWrap}
                        text={trade.violations.map((v) =>
                          v.type === 'CONDITION_VIOLATION'
                            ? v.condition?.label ?? 'Condición'
                            : v.rule?.label ?? 'Regla'
                        ).join('\n')}
                      >
                        <p
                          ref={(el) => { violRefs.current[i] = el }}
                          className={styles.violationBadge}
                        >
                          {vCount} violación{vCount > 1 ? 'es' : ''}
                        </p>
                      </Tooltip>
                    ) : (
                      <p
                        ref={(el) => { violRefs.current[i] = el }}
                        className={styles.noViolationBadge}
                      >
                        Sin violación
                      </p>
                    )}
                  </td>
                  <td>
                    <p className={
                      trade.result === 'WIN' ? styles.resultWin
                        : trade.result === 'LOSS' ? styles.resultLoss
                          : styles.resultBe
                    }>
                      {trade.result === 'WIN' ? 'Win' : trade.result === 'LOSS' ? 'Loss' : 'BE'}
                    </p>
                  </td>
                  <td>
                    {pnl !== null && pnl !== undefined ? (
                      <p
                        ref={(el) => { pnlRefs.current[i] = el }}
                        className={
                          pnl > 0 ? styles.pnlPositive
                            : pnl < 0 ? styles.pnlNegative
                              : styles.pnlNeutral
                        }
                      >
                        {pnl > 0 ? '+' : ''}{pnl} USD
                      </p>
                    ) : (
                      <p
                        ref={(el) => { pnlRefs.current[i] = el }}
                        className={styles.pnlNeutral}
                      >
                        —
                      </p>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {hasTotalRow && (
            <tfoot>
              <tr className={styles.staticTotalRow}>
                <td colSpan={6}>
                  <div className={styles.staticTotalCell}>
                    <span className={styles.staticTotalLabel}>Total:</span>
                    <p
                      ref={(el) => { pnlRefs.current[trades.length] = el }}
                      className={
                        totalPnl > 0 ? styles.pnlPositive
                          : totalPnl < 0 ? styles.pnlNegative
                            : styles.pnlNeutral
                      }
                    >
                      {totalPnl > 0 ? '+' : ''}{totalPnl} USD
                    </p>
                  </div>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    )
  }

  // ── Construir texto del tooltip de fila ────────────────────────────────
  function buildRowTooltip(trade: Trade): string | null {
    const parts: string[] = []
    if (trade.notes) parts.push(`"${trade.notes}"`)
    if (trade.violations.length > 0) {
      const names = trade.violations
        .map((v) => v.type === 'CONDITION_VIOLATION'
          ? v.condition?.label ?? 'Condición'
          : v.rule?.label ?? 'Regla')
        .join(', ')
      parts.push(names)
    }
    return parts.length > 0 ? parts.join(' · ') : null
  }

  // ── Interactive variant ─────────────────────────────────────────────────
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th><p>Hora</p></th>
            <th><p>Dirección</p></th>
            <th><p>Activo</p></th>
            <th><p>Violación</p></th>
            <th><p>Resultado</p></th>
            <th><p>PnL</p></th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => {
            const hasViolations = trade.violations.length > 0
            const timestamp = trade.timestamp ?? trade.createdAt
            const time = timestamp
              ? new Date(timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
              : '—'
            const tooltipText = buildRowTooltip(trade)

            return (
              <tr
                key={trade.id}
                className={styles.tradeRow}
                onMouseEnter={tooltipText ? (e) => handleRowEnter(trade.id, e) : undefined}
                onMouseLeave={tooltipText ? handleRowLeave : undefined}
              >
                <td><p>{time}</p></td>
                <td>
                  <p className={trade.direction === 'LONG' ? styles.dirLong : styles.dirShort}>
                    {trade.direction === 'LONG' ? 'Long / Alcista' : 'Short / Bajista'}
                  </p>
                </td>
                <td><p>{trade.asset ?? '—'}</p></td>
                <td>
                  {hasViolations ? (
                    <p className={styles.violationBadge}>
                      {trade.violations.length} {trade.violations.length === 1 ? 'violación' : 'violaciones'}
                    </p>
                  ) : (
                    <p className={styles.noViolationBadge}>Sin violación</p>
                  )}
                </td>
                <td>
                  <p className={
                    trade.result === 'WIN' ? styles.resultWin
                      : trade.result === 'LOSS' ? styles.resultLoss
                        : styles.resultBe
                  }>
                    {trade.result === 'WIN' ? 'Win' : trade.result === 'LOSS' ? 'Loss' : 'BE'}
                  </p>
                </td>
                <td>
                  {trade.pnlAmount !== null && trade.pnlAmount !== undefined ? (
                    <p className={
                      trade.pnlAmount > 0 ? styles.pnlPositive
                        : trade.pnlAmount < 0 ? styles.pnlNegative
                          : styles.pnlNeutral
                    }>
                      {trade.pnlAmount > 0 ? '+' : ''}{trade.pnlAmount} USD
                    </p>
                  ) : (
                    <p className={styles.pnlNeutral}>—</p>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {mounted && hoveredTrade && tooltipPos && (() => {
        const text = buildRowTooltip(hoveredTrade)
        if (!text) return null
        return createPortal(
          <div
            className={styles.rowTooltip}
            style={{ top: tooltipPos.top, left: tooltipPos.left }}
          >
            {text}
          </div>,
          document.body,
        )
      })()}
    </div>
  )
}
