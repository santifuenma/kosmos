import { Tooltip } from '@/components/ui/Tooltip'
import { InfoSvg, EmotionFaceIcon } from '@/components/icons'
import { EMOTIONAL_STATE_LABELS, type EmotionalState } from '@/types'
import styles from './SessionStatsCard.module.css'

type SessionStatsCardProps = {
  trades: number
  maxTrades: number
  violations: number
  minutes: number
  emotionalState?: string | null
  title?: string
  tooltipText?: string
  variant?: 'static' | 'live'
}

export function SessionStatsCard({
  trades,
  maxTrades,
  violations,
  minutes,
  emotionalState,
  title = 'Resumen de la sesión',
  tooltipText = 'Datos generales de esta sesión de trading: operaciones realizadas, violaciones y duración.',
  variant = 'static',
}: SessionStatsCardProps) {
  const atMaxTrades = trades >= maxTrades && maxTrades > 0

  return (
    <div className={`innerCard ${styles.card}`}>
      <h3 className={styles.title}>
        {title}
        <Tooltip text={tooltipText}>
          <InfoSvg />
        </Tooltip>
      </h3>
      <div className={styles.divider} />
      <div className={styles.list}>
        <div className={styles.item}>
          <p className={`${styles.number} ${variant === 'live' && atMaxTrades ? styles.numberDanger : variant === 'live' ? styles.numberSuccess : ''}`}>
            {trades}
          </p>
          <div className={styles.text}>
            <p className={styles.label}>
              {variant === 'live'
                ? `Trades realizados (${Math.max(0, maxTrades - trades)} restantes)`
                : 'Trades realizados'}
            </p>
            {atMaxTrades && (
              <p className={styles.hint}>
                Has alcanzado tu límite de operaciones
              </p>
            )}
          </div>
        </div>
        <div className={styles.itemDivider} />
        <div className={styles.item}>
          <p className={`${styles.number} ${variant === 'live' && violations > 0 ? styles.numberWarning : variant === 'live' ? styles.numberSuccess : ''}`}>
            {violations}
          </p>
          <p className={styles.label}>Violaciones cometidas</p>
        </div>
        <div className={styles.itemDivider} />
        <div className={styles.item}>
          <p className={styles.number}>{minutes}</p>
          <p className={styles.label}>Minutos en sesión</p>
        </div>
        {emotionalState && (
          <>
            <div className={styles.itemDivider} />
            <div className={styles.item}>
              <div className={styles.iconWrap}>
                <EmotionFaceIcon state={emotionalState} />
              </div>
              <p className={styles.label}>
                Estado emocional:{' '}
                <span className={styles.emotionValue}>
                  {EMOTIONAL_STATE_LABELS[emotionalState as EmotionalState]?.label ?? emotionalState}
                </span>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
