// ─────────────────────────────────────────────────────────────────────────────
// Tests unitarios de los helpers de fecha y estadística.
// Todos trabajan en UTC para ser independientes del huso del entorno de CI.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  getStartOfToday,
  getStartOfTomorrow,
  getMondayUTC,
  getISOWeekNumber,
  stdDevPopulation,
} from './dates'

describe('getStartOfToday', () => {
  it('normaliza a medianoche UTC del mismo día calendario', () => {
    const input = new Date(Date.UTC(2026, 5, 17, 14, 23, 45, 678))
    const result = getStartOfToday(input)
    expect(result.toISOString()).toBe('2026-06-17T00:00:00.000Z')
  })

  it('no muta la fecha original', () => {
    const input = new Date(Date.UTC(2026, 5, 17, 14, 23, 45))
    const before = input.getTime()
    getStartOfToday(input)
    expect(input.getTime()).toBe(before)
  })
})

describe('getStartOfTomorrow', () => {
  it('avanza al inicio del día siguiente UTC', () => {
    const input = new Date(Date.UTC(2026, 5, 17, 23, 59, 59))
    expect(getStartOfTomorrow(input).toISOString()).toBe('2026-06-18T00:00:00.000Z')
  })

  it('cruza correctamente el cambio de mes', () => {
    const input = new Date(Date.UTC(2026, 5, 30, 10, 0, 0))
    expect(getStartOfTomorrow(input).toISOString()).toBe('2026-07-01T00:00:00.000Z')
  })
})

describe('getMondayUTC', () => {
  it('desde un lunes devuelve el mismo día', () => {
    // 2026-06-15 es lunes
    const monday = new Date(Date.UTC(2026, 5, 15, 12, 0, 0))
    expect(getMondayUTC(monday).toISOString()).toBe('2026-06-15T00:00:00.000Z')
  })

  it('desde un domingo retrocede 6 días al lunes anterior', () => {
    // 2026-06-21 es domingo; el lunes ISO es 2026-06-15
    const sunday = new Date(Date.UTC(2026, 5, 21, 10, 0, 0))
    expect(getMondayUTC(sunday).toISOString()).toBe('2026-06-15T00:00:00.000Z')
  })

  it('desde un miércoles retrocede 2 días', () => {
    // 2026-06-17 es miércoles
    const wed = new Date(Date.UTC(2026, 5, 17, 9, 30, 0))
    expect(getMondayUTC(wed).toISOString()).toBe('2026-06-15T00:00:00.000Z')
  })
})

describe('getISOWeekNumber', () => {
  it('asigna la semana ISO correcta para un día arbitrario', () => {
    // 2026-06-17 (miércoles) → semana 25 ISO de 2026
    expect(getISOWeekNumber(new Date(Date.UTC(2026, 5, 17)))).toBe(25)
  })

  it('el 1 de enero de 2026 (jueves) cae en la semana 1', () => {
    // Por definición ISO, la semana 1 es la que contiene el primer jueves.
    // 2026-01-01 es jueves → semana 1.
    expect(getISOWeekNumber(new Date(Date.UTC(2026, 0, 1)))).toBe(1)
  })

  it('el 31 de diciembre puede pertenecer a la semana 1 del año siguiente', () => {
    // 2024-12-30 (lunes) e incluso días sucesivos pertenecen a la semana 1 de 2025
    // según ISO 8601. Validamos con una fecha menos ambigua: 2025-12-29 (lunes)
    // pertenece a la semana 1 de 2026 porque su jueves cae en enero.
    expect(getISOWeekNumber(new Date(Date.UTC(2025, 11, 29)))).toBe(1)
  })
})

describe('stdDevPopulation', () => {
  it('devuelve 0 con un solo valor (no hay variabilidad)', () => {
    expect(stdDevPopulation([0.7])).toBe(0)
  })

  it('devuelve 0 cuando todos los valores son iguales', () => {
    expect(stdDevPopulation([0.5, 0.5, 0.5])).toBe(0)
  })

  it('devuelve 0 para un array vacío', () => {
    expect(stdDevPopulation([])).toBe(0)
  })

  it('calcula la σ poblacional correctamente con valores extremos', () => {
    // Para [0, 1]: μ = 0.5, var = ((0-0.5)² + (1-0.5)²)/2 = 0.25, σ = 0.5
    expect(stdDevPopulation([0, 1])).toBe(0.5)
  })

  it('no usa Bessel (n-1) sino n en el denominador', () => {
    // Para [2, 4, 4, 4, 5, 5, 7, 9] el resultado poblacional es exactamente 2.
    // Con muestra (n-1) sería 2.138... (≠ 2). Verificamos la elección.
    expect(stdDevPopulation([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2)
  })
})
