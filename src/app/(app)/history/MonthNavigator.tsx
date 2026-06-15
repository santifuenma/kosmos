'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useRef, useState, useEffect } from 'react'
import { ArrowLeftIcon, ArrowRightIcon } from '@/components/icons'
import styles from './page.module.css'

type AvailableMonth = { year: number; month: number; label: string }

type MonthNavigatorProps = {
  year: number
  month: number
  monthLabel: string
  availableMonths: AvailableMonth[]
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export default function MonthNavigator({ year, month, monthLabel, availableMonths }: MonthNavigatorProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onOutsideClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutsideClick)
    return () => document.removeEventListener('mousedown', onOutsideClick)
  }, [open])

  const navigateTo = (y: number, m: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('year', String(y))
    params.set('month', String(m))
    router.push(`/history?${params.toString()}`)
    setOpen(false)
  }

  const navigate = (dir: -1 | 1) => {
    let newMonth = month + dir
    let newYear = year
    if (newMonth < 1) { newMonth = 12; newYear-- }
    if (newMonth > 12) { newMonth = 1; newYear++ }

    const now = new Date()
    if (newYear > now.getFullYear() || (newYear === now.getFullYear() && newMonth > now.getMonth() + 1)) return

    navigateTo(newYear, newMonth)
  }

  const now = new Date()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  return (
    <div className={styles.monthBarRight} ref={wrapRef}>
      {/* Month selector with dropdown */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          className={`ctaBtn ctaBtnSecondary ${styles.monthSelector}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <p className={styles.monthLabel}>{monthLabel}</p>
          <span className={styles.monthChevron}>
            <ChevronDownIcon open={open} />
          </span>
        </button>

        {open && availableMonths.length > 0 && (
          <div className={styles.monthDropdown}>
            {availableMonths.map((am) => {
              const isSelected = am.year === year && am.month === month
              return (
                <button
                  key={`${am.year}-${am.month}`}
                  type="button"
                  className={`${styles.monthDropdownItem} ${isSelected ? styles.monthDropdownItemActive : ''}`}
                  onClick={() => navigateTo(am.year, am.month)}
                >
                  {am.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Arrow buttons */}
      <button type="button" className={`ctaBtn ctaBtnSecondary ${styles.monthArrow}`} onClick={() => navigate(-1)}>
        <ArrowLeftIcon />
      </button>
      <button
        type="button"
        className={`ctaBtn ctaBtnSecondary ${styles.monthArrow}`}
        onClick={() => navigate(1)}
        disabled={isCurrentMonth}
        style={isCurrentMonth ? { opacity: 0.3, cursor: 'default' } : undefined}
      >
        <ArrowRightIcon />
      </button>
    </div>
  )
}
