import Link from 'next/link'
import styles from './MonthlyCalendar.module.css'

type DaySession = {
  id: string
  icoScore: number | null
}

type MonthlyCalendarProps = {
  year: number
  month: number
  sessionsByDate: Map<number, DaySession>
  showToday?: boolean
}

/* Mini ICO ring — same approach as IcoCard but smaller.
   circle r=18  → circumference = 2·π·18 ≈ 113.1  */
const RING_C = 113.1

function MiniRing({ score }: { score: number | null }) {
  const pct = score ?? 0
  const offset = RING_C * (1 - pct)

  const colorClass =
    score === null ? styles.ringNeutral
      : pct >= 0.85 ? styles.ringSuccess
        : pct >= 0.70 ? styles.ringWarning
          : styles.ringDanger

  return (
    <svg
      className={styles.ringSvg}
      viewBox="0 0 44 44"
      style={{ transform: 'rotate(-90deg)' }}
    >
      <circle cx="22" cy="22" r="18" className={styles.ringTrack} />
      <circle
        cx="22" cy="22" r="18"
        className={`${styles.ringProgress} ${colorClass}`}
        strokeDashoffset={offset}
      />
    </svg>
  )
}

export function MonthlyCalendar({ year, month, sessionsByDate, showToday = true }: MonthlyCalendarProps) {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const calOffset = firstDow === 0 ? 6 : firstDow - 1

  const now = new Date()
  const isCurrentMonth = year === now.getUTCFullYear() && month === now.getUTCMonth() + 1
  const todayDay = showToday && isCurrentMonth ? now.getUTCDate() : -1

  const total = calOffset + daysInMonth
  const lastRowStart = Math.floor((total - 1) / 7) * 7

  return (
    <div className={styles.wrap}>
      {/* Day-of-week headers */}
      <div className={styles.dowGrid}>
        {['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'].map((d) => (
          <p key={d} className={styles.dow}>{d}</p>
        ))}
      </div>

      {/* Day grid */}
      <div className={styles.grid}>
        {Array.from({ length: calOffset }).map((_, i) => (
          <div
            key={`gap-${i}`}
            className={i >= lastRowStart ? `${styles.dayEmpty} ${styles.lastRow}` : styles.dayEmpty}
          />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const daySess = sessionsByDate.get(day)
          const isToday = day === todayDay
          const cellIndex = calOffset + day - 1

          const cellClass = [
            styles.day,
            isToday ? styles.dayToday : '',
            daySess ? styles.daySession : '',
            cellIndex >= lastRowStart ? styles.lastRow : '',
          ].filter(Boolean).join(' ')

          /* Content inside the cell */
          const inner = (
            <>
              <span className={styles.dayNum}>{day}</span>
              {daySess && (
                <div className={styles.ringWrap}>
                  <MiniRing score={daySess.icoScore} />
                </div>
              )}
              {daySess && (
                <span className={styles.dayIco}>
                  {daySess.icoScore != null ? Math.round(daySess.icoScore * 100) : '—'}
                  <span className={styles.dayIcoDenom}> /100</span>
                </span>
              )}
            </>
          )

          /* Link or plain div — always the direct grid child */
          if (daySess) {
            return (
              <Link key={day} href={`/session/${daySess.id}`} className={cellClass}>
                {inner}
              </Link>
            )
          }

          return (
            <div key={day} className={cellClass}>
              {inner}
            </div>
          )
        })}
      </div>
    </div>
  )
}
