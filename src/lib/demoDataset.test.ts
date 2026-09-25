// ─────────────────────────────────────────────────────────────────────────────
// Tests del historial de ejemplo del demo (src/lib/demoDataset.ts).
// Es una función pura: basta con pasarle distintas fechas de "hoy".
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import { buildDemoDataset, DEMO_STRATEGY } from './demoDataset'

const SEPT_25 = new Date(Date.UTC(2026, 8, 25, 10, 0))
const OCT_25 = new Date(Date.UTC(2026, 9, 25, 10, 0))

describe('buildDemoDataset', () => {
  it('con la misma fecha genera exactamente lo mismo', () => {
    expect(buildDemoDataset(SEPT_25)).toEqual(buildDemoDataset(SEPT_25))
  })

  it('cubre el mes actual hasta ayer y los dos anteriores', () => {
    const days = buildDemoDataset(SEPT_25)
    const first = days[0].date
    const last = days[days.length - 1].date
    expect(first.getUTCMonth()).toBe(6) // julio
    expect(last < new Date(Date.UTC(2026, 8, 25))).toBe(true)
    expect(last.getUTCMonth()).toBe(8) // septiembre
  })

  it('solo genera días laborables y nunca hoy ni días futuros', () => {
    const today = new Date(Date.UTC(2026, 8, 25))
    for (const d of buildDemoDataset(SEPT_25)) {
      expect([0, 6]).not.toContain(d.date.getUTCDay())
      expect(d.date < today).toBe(true)
    }
  })

  it('el mismo día del mes sale igual aunque cambie el mes', () => {
    // El 14 de septiembre (mes en curso el 25/09) y el 14 de octubre (mes en
    // curso el 25/10) son el mismo día del demo, desplazado un mes.
    const sept14 = buildDemoDataset(SEPT_25).find((d) => d.monthsAgo === 0 && d.date.getUTCDate() === 14)
    const oct14 = buildDemoDataset(OCT_25).find((d) => d.monthsAgo === 0 && d.date.getUTCDate() === 14)
    // Octubre y septiembre caen en días de la semana distintos, así que solo
    // es comparable si ambos son laborables y con sesión.
    if (sept14 && oct14) {
      expect(oct14.icoScore).toBe(sept14.icoScore)
      expect(oct14.trades.map((t) => t.result)).toEqual(sept14.trades.map((t) => t.result))
    }
  })

  it('incluye sesiones con violaciones y notas', () => {
    const days = buildDemoDataset(SEPT_25)
    const trades = days.flatMap((d) => d.trades)
    expect(trades.some((t) => t.conditionCodes.length > 0)).toBe(true)
    expect(trades.some((t) => t.ruleCodes.length > 0)).toBe(true)
    expect(trades.some((t) => t.notes)).toBe(true)
    expect(days.some((d) => d.notes)).toBe(true)
  })

  it('marca MAX_TRADES_LIMIT justo cuando se pasa del máximo de la estrategia', () => {
    for (const d of buildDemoDataset(SEPT_25)) {
      expect(d.sessionRuleCodes.includes('MAX_TRADES_LIMIT')).toBe(d.trades.length > DEMO_STRATEGY.maxTrades)
    }
  })

  it('las operaciones fuera de horario son exactamente las que violan TRADING_HOURS', () => {
    for (const t of buildDemoDataset(SEPT_25).flatMap((d) => d.trades)) {
      const minutes = t.timestamp.getUTCHours() * 60 + t.timestamp.getUTCMinutes()
      const outside = minutes < 9 * 60 || minutes > 11 * 60 + 30
      expect(outside).toBe(t.ruleCodes.includes('TRADING_HOURS'))
    }
  })

  it('cuenta una historia de mejora: cada mes es más disciplinado que el anterior', () => {
    // Un mes concreto tiene pocos días y puede salir algo mejor o peor por
    // azar; la tendencia se comprueba promediando un año entero de fechas.
    const byMonth: Record<number, number[]> = { 0: [], 1: [], 2: [] }
    for (let i = 0; i < 365; i += 7) {
      const days = buildDemoDataset(new Date(Date.UTC(2026, 0, 1) + i * 86_400_000))
      for (const m of [0, 1, 2]) {
        const icos = days.filter((d) => d.monthsAgo === m).map((d) => d.icoScore)
        if (icos.length) byMonth[m].push(icos.reduce((a, b) => a + b, 0) / icos.length)
      }
    }
    const avg = (m: number) => byMonth[m].reduce((a, b) => a + b, 0) / byMonth[m].length
    expect(avg(1)).toBeGreaterThan(avg(2))
    expect(avg(0)).toBeGreaterThan(avg(1))
  })

  it('hay días verdes, amarillos y rojos', () => {
    const icos = buildDemoDataset(SEPT_25).map((d) => d.icoScore * 100)
    expect(icos.some((x) => x >= 85)).toBe(true)
    expect(icos.some((x) => x >= 70 && x < 85)).toBe(true)
    expect(icos.some((x) => x < 70)).toBe(true)
  })
})
