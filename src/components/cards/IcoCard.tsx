import { Tooltip } from '@/components/ui/Tooltip'
import { CalIcon } from '@/components/icons'
import styles from './IcoCard.module.css'

type IcoCardProps = {
  score: number | null
  title?: string
  tooltipText?: string
  dateLabel?: string | null
  violations?: number | null
}

export function IcoCard({
  score,
  title = 'ICO diario',
  tooltipText = 'El ICO (Índice de Coherencia Operativa) mide tu disciplina, no los resultados financieros. Un ICO alto significa que seguiste tu estrategia correctamente.',
  dateLabel,
  violations,
}: IcoCardProps) {
  const percent = score !== null ? Math.round(score * 100) : null
  const quality =
    score === null ? null
      : score >= 0.85 ? 'high'
        : score >= 0.70 ? 'medium'
          : 'low'

  const qualityLabel = {
    high: 'Alta coherencia',
    medium: 'Coherencia moderada',
    low: 'Baja coherencia',
  }

  const RING_CIRCUMFERENCE = 364.4
  const ringOffset = score !== null ? RING_CIRCUMFERENCE * (1 - score) : RING_CIRCUMFERENCE

  const ringColorClass =
    quality === 'high' ? styles.icoRingSuccess
      : quality === 'medium' ? styles.icoRingWarning
        : styles.icoRingDanger

  const badgeClass =
    quality === 'high' ? styles.icoBadgeHigh
      : quality === 'medium' ? styles.icoBadgeMedium
        : quality === 'low' ? styles.icoBadgeLow
          : styles.icoBadgeNeutral

  return (
    <div className={`innerCard ${styles.icoCard}`}>
      <h3 className={styles.title}>
        {title}
        <Tooltip text={tooltipText}>
          <InfoIcon />
        </Tooltip>
      </h3>
      <div className={styles.body}>
        <div className={styles.ringWrap}>
          <svg
            viewBox="0 0 128 128"
            width={125}
            height={125}
            style={{ transform: 'rotate(-90deg)' }}
            aria-label={percent !== null ? `ICO: ${percent} de 100` : 'Sin datos ICO'}
          >
            <circle cx="64" cy="64" r="58" className={styles.ringTrack} />
            <circle
              cx="64" cy="64" r="58"
              className={`${styles.ringProgress} ${ringColorClass}`}
              strokeDashoffset={ringOffset}
            />
            <g transform="rotate(90 64 64)">
              <text x="65" y="55" className={styles.ringNumber} textAnchor="middle" dominantBaseline="middle">
                {percent ?? '—'}
              </text>
              <text x="64" y="86" className={styles.ringDenom} textAnchor="middle" dominantBaseline="middle">
                /100
              </text>
            </g>
          </svg>
        </div>

        <div className={styles.meta}>
          {quality ? (
            <span className={`${styles.icoBadge} ${badgeClass}`}>
              {qualityLabel[quality]}
            </span>
          ) : (
            <span className={`${styles.icoBadge} ${styles.icoBadgeNeutral}`}>Sin datos</span>
          )}
          {dateLabel && (
            <p className={styles.metaDate}>
              <CalIcon />
              {dateLabel}
            </p>
          )}
          {violations !== null && violations !== undefined && (
            <p className={styles.metaViolations}>
              <span>✕</span>
              {violations} {violations === 1 ? 'violación' : 'violaciones'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <circle cx="7.5" cy="7.5" r="6.5" stroke="currentColor" strokeWidth="1.1" />
      <line x1="7.5" y1="6.5" x2="7.5" y2="10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="7.5" cy="4.5" r="0.8" fill="currentColor" />
    </svg>
  )
}
