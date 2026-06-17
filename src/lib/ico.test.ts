// ─────────────────────────────────────────────────────────────────────────────
// Tests unitarios de las fórmulas del ICO.
// Funciones puras → no necesitan mocks, base de datos ni DOM.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import { computeIco, computeWeeklyIco } from './ico'

describe('computeIco (ICO diario)', () => {
  it('devuelve 1 cuando no hay nada que evaluar (Rs = 0)', () => {
    // Sin trades ni reglas de sesión activas, el denominador es 0.
    // La convención del producto es ICO = 1 (no se penaliza lo no medible).
    expect(computeIco({ Ts: 0, cActive: 0, rTrade: 0, rSession: 0, vTotal: 0 })).toBe(1)
  })

  it('devuelve 1 cuando el trader no comete ninguna violación', () => {
    // 3 trades × (2 condiciones + 1 regla PER_TRADE) + 1 regla PER_SESSION = Rs=10
    // vTotal=0 → ICO=1
    expect(
      computeIco({ Ts: 3, cActive: 2, rTrade: 1, rSession: 1, vTotal: 0 }),
    ).toBe(1)
  })

  it('devuelve 0 cuando viola todo lo evaluable', () => {
    // Rs = 3 × 2 + 3 × 1 + 1 = 10, vTotal = 10 → ICO = 0
    expect(
      computeIco({ Ts: 3, cActive: 2, rTrade: 1, rSession: 1, vTotal: 10 }),
    ).toBe(0)
  })

  it('devuelve 0.5 cuando viola la mitad de lo evaluable', () => {
    // Rs = 2 × 1 = 2, vTotal = 1 → ICO = 0.5
    expect(
      computeIco({ Ts: 2, cActive: 1, rTrade: 0, rSession: 0, vTotal: 1 }),
    ).toBe(0.5)
  })

  it('redondea a 4 decimales (1/3 ≈ 0.6667)', () => {
    // Rs = 3, vTotal = 1 → ICO = 1 - 1/3 = 0.6666... → 0.6667
    expect(
      computeIco({ Ts: 3, cActive: 1, rTrade: 0, rSession: 0, vTotal: 1 }),
    ).toBe(0.6667)
  })

  it('clampea a [0,1] si por error vTotal supera Rs', () => {
    // Defensivo: no debería ocurrir con datos consistentes, pero blindamos.
    expect(
      computeIco({ Ts: 1, cActive: 1, rTrade: 0, rSession: 0, vTotal: 100 }),
    ).toBe(0)
  })

  it('cuenta solo reglas de sesión cuando no hay trades', () => {
    // Trader que abre sesión y no opera: Rs = 0 + 0 + 1 = 1.
    expect(
      computeIco({ Ts: 0, cActive: 5, rTrade: 5, rSession: 1, vTotal: 0 }),
    ).toBe(1)
    // (Las condiciones y reglas PER_TRADE se anulan al multiplicar por Ts = 0.)
  })

  it('penaliza correctamente al violar la regla de sesión sin trades', () => {
    // Mismo caso anterior pero con la regla de sesión incumplida.
    expect(
      computeIco({ Ts: 0, cActive: 5, rTrade: 5, rSession: 1, vTotal: 1 }),
    ).toBe(0)
  })
})

describe('computeWeeklyIco (ICO semanal)', () => {
  it('devuelve null para una semana sin sesiones', () => {
    expect(computeWeeklyIco([])).toBeNull()
  })

  it('una semana perfecta y estable da ICO 1', () => {
    // M = 1, σ = 0 → E = 1 → 0.7·1 + 0.3·1 = 1.0
    expect(computeWeeklyIco([1, 1, 1, 1])).toEqual({
      icoWeekly: 1,
      avgDailyIco: 1,
      stability: 1,
    })
  })

  it('una semana baja pero estable mezcla media con estabilidad', () => {
    // M = 0.5, σ = 0 → E = 1 → 0.7·0.5 + 0.3·1 = 0.65
    expect(computeWeeklyIco([0.5, 0.5, 0.5])).toEqual({
      icoWeekly: 0.65,
      avgDailyIco: 0.5,
      stability: 1,
    })
  })

  it('penaliza la alta variabilidad incluso con media decente', () => {
    // [1, 0, 1, 0]: M = 0.5, σ = 0.5 → E = max(0, 1 - 0.5/0.5) = 0
    // → 0.7·0.5 + 0.3·0 = 0.35
    expect(computeWeeklyIco([1, 0, 1, 0])).toEqual({
      icoWeekly: 0.35,
      avgDailyIco: 0.5,
      stability: 0,
    })
  })

  it('una sola sesión: estabilidad máxima (σ = 0)', () => {
    // M = 0.8, σ = 0 → E = 1 → 0.7·0.8 + 0.3·1 = 0.86
    expect(computeWeeklyIco([0.8])).toEqual({
      icoWeekly: 0.86,
      avgDailyIco: 0.8,
      stability: 1,
    })
  })
})
