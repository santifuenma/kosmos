import { Tooltip } from '@/components/ui/Tooltip'
import { InfoSvg, EmotionFaceIcon } from '@/components/icons'
import { type EmotionalState } from '@/types'
import { emotionalStateLabel, type Gender } from '@/lib/gender'
import styles from './SessionStatsCard.module.css'

type SessionStatsCardProps = {
  trades: number
  maxTrades: number
  violations: number
  minutes: number
  emotionalState?: string | null
  // El estado emocional califica al trader, así que su etiqueta concuerda con
  // el género declarado. Lo recibe por prop en lugar de leer la sesión para
  // que el componente siga siendo presentacional y usable desde servidor.
  gender: Gender
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
  gender,
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
                  {emotionalStateLabel(emotionalState as EmotionalState, gender) ?? emotionalState}
                </span>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
