'use client'

import { useEffect, useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  TooltipContentProps,
} from 'recharts'

const COLOR_SUCCESS = '#53e46e'
const COLOR_WARNING = '#ffd240'
const COLOR_DANGER = '#ff5f54'
const TEXT_MUTED = 'rgba(255,255,255,0.60)'
const GRID_STROKE = 'rgba(255,255,255,0.12)'

type WeekDatum = { label: string; ico: number; weekStart: string; weekEnd: string }

type WeeklyChartProps = {
  data: WeekDatum[]
}

function useIsTablet(maxWidth = 900): boolean {
  const [isTablet, setIsTablet] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`)
    setIsTablet(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsTablet(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [maxWidth])
  return isTablet
}

// Hook para detectar móvil (≤ 450px, mismo breakpoint que page.module.css).
// Recharts no acepta media queries en sus props, así que tenemos que conmutar
// los valores en runtime.
function useIsMobile(maxWidth = 450): boolean {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`)
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [maxWidth])
  return isMobile
}

function formatWeekRange(startISO: string, endISO: string): string {
  const start = new Date(startISO)
  const end = new Date(endISO)
  const startDay = start.getUTCDate()
  const endDay = end.getUTCDate()
  const startMonth = start.toLocaleDateString('es-ES', { month: 'long', timeZone: 'UTC' })
  const endMonth = end.toLocaleDateString('es-ES', { month: 'long', timeZone: 'UTC' })
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `Del ${startDay} al ${endDay} de ${endMonth}`
  }
  return `Del ${startDay} de ${startMonth} al ${endDay} de ${endMonth}`
}

// Tooltip sobre los puntos del gráfico.
// Recharts 3.x usa `TooltipContentProps` (no `TooltipProps`) para tipar el
// argumento que recibe el componente personalizado pasado a `<Tooltip content=…>`.
// Mantenemos los genéricos por defecto del tipo para que la prop `content`
// del componente `<Tooltip>` acepte esta función sin conflictos de varianza.
function CustomTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const datum = payload[0].payload as WeekDatum
  return (
    <div style={{
      background: 'rgba(255,255,255,0.15)',
      backdropFilter: 'blur(14px)',
      border: '1px solid rgba(255,255,255,0.20)',
      borderRadius: 10,
      padding: '8px 12px',
      fontSize: 13,
      color: 'white',
      fontFamily: 'Montserrat, sans-serif',
      lineHeight: 1.4,
    }}>
      <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 2 }}>
        {formatWeekRange(datum.weekStart, datum.weekEnd)}
      </div>
      <div>
        <span style={{ opacity: 0.7 }}>ICO: </span>
        <strong>{datum.ico}</strong>
        <span style={{ fontWeight: 300, opacity: 0.55, marginLeft: 4 }}>/100</span>
      </div>
    </div>
  )
}

// Labels ICO y Semana
const axisLabelStyle: React.CSSProperties = {
  position: 'absolute',
  fontSize: 11,
  fontFamily: 'Montserrat, sans-serif',
  color: 'rgba(255,255,255,0.50)',
  lineHeight: 1,
  userSelect: 'none',
}

export default function WeeklyChart({ data }: WeeklyChartProps) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()

  // Sustituye TODOS los valores que se ven en el chart según viewport.
  // Edita aquí para afinar el aspecto en cada tamaño.
  // Orden: móvil primero (más específico), luego tablet, luego desktop.
  const cfg = isMobile
    ? {
      icoLabel: { bottom: 12, left: 8 },
      semanaLabel: { bottom: 0, left: 30 },
      areaMargin: { top: 8, right: 10, left: -25, bottom: -13 },
      xAxisPadding: { left: 55, right: 12 },
      tickFontSize: 10,
    }
    : isTablet
    ? {
      icoLabel: { bottom: 12, left: 8 },
      semanaLabel: { bottom: 0, left: 30 },
      areaMargin: { top: 8, right: 10, left: -25, bottom: -13 },
      xAxisPadding: { left: 55, right: 12 },
      tickFontSize: 10,
    }
    : {
      icoLabel: { bottom: 25, left: 44 },
      semanaLabel: { bottom: 10, left: 68 },
      areaMargin: { top: 8, right: 50, left: 8, bottom: -2 },
      xAxisPadding: { left: 80, right: 30 },
      tickFontSize: 11,
    }

  if (data.length === 0) {
    return (
      <p style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 14, color: 'rgba(255,255,255,0.6)', padding: '20px 0' }}>
        Sin sesiones este mes
      </p>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', outline: 'none' }}>
      <span style={{ ...axisLabelStyle, bottom: cfg.icoLabel.bottom, left: cfg.icoLabel.left }}>ICO</span>
      <span style={{ ...axisLabelStyle, bottom: cfg.semanaLabel.bottom, left: cfg.semanaLabel.left }}>Semana</span>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={cfg.areaMargin} style={{ outline: 'none' }}>
          <defs>
            <linearGradient id="icoAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.00)" />
            </linearGradient>
          </defs>

          {/* Labels del Eje X (Semanas)*/}
          <XAxis
            dataKey="label"
            padding={cfg.xAxisPadding}
            tick={{ fill: TEXT_MUTED, fontSize: cfg.tickFontSize, fontFamily: 'Montserrat, sans-serif' }}
            axisLine={{ stroke: GRID_STROKE, strokeWidth: 1 }}
            tickLine={false}
          />

          {/* Labels del Eje Y (ICO)*/}
          <YAxis
            domain={[0, 100]}
            ticks={[20, 50, 80, 100]}
            interval={0}
            tick={{ fill: 'rgba(255,255,255,0.56)', fontSize: cfg.tickFontSize, fontFamily: 'Montserrat, sans-serif' }}
            axisLine={{ stroke: GRID_STROKE, strokeWidth: 1 }}
            tickLine={false}
          />

          {/* Grid HorIZONTAL*/}
          <CartesianGrid
            horizontal={true}
            vertical={false}
            horizontalValues={[20, 50, 80, 100]}
            stroke={GRID_STROKE}
            strokeWidth={1}
          />

          <Tooltip content={CustomTooltip} cursor={{ stroke: 'rgba(255,255,255,0.15)', strokeWidth: 0 }} />

          <Area
            type="monotone"
            dataKey="ico"
            stroke="rgba(255,255,255,0.60)"
            strokeWidth={0}
            fill="url(#icoAreaGrad)"
            dot={(props) => {
              const { cx, cy, payload } = props
              const ico = payload?.ico ?? 0
              const color = ico >= 85 ? COLOR_SUCCESS : ico >= 70 ? COLOR_WARNING : COLOR_DANGER
              return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={5} fill={color} stroke="rgba(0,0,0,0.25)" strokeWidth={1} />
            }}
            activeDot={{ r: 6, stroke: 'white', strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
