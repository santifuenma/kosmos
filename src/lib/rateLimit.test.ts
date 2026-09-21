// ─────────────────────────────────────────────────────────────────────────────
// rateLimit.test.ts — tests de la identificación del cliente.
//
// Solo se cubre getClientIp, que es la única parte pura del módulo: el resto
// habla con PostgreSQL y necesitaría una base de datos levantada, algo que los
// tests unitarios de este proyecto no hacen (ver vitest.config.ts).
//
// Merece la pena cubrirla precisamente porque de ella depende contra quién se
// cuenta: si devolviera el mismo valor para todo el mundo, el límite por IP
// dejaría fuera a usuarios legítimos en cuanto otro agotara el cupo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import { getClientIp } from '@/lib/rateLimit'

describe('getClientIp', () => {
  it('prefiere x-real-ip cuando está presente', () => {
    const headers = new Headers({
      'x-real-ip': '203.0.113.7',
      'x-forwarded-for': '198.51.100.1, 10.0.0.1',
    })
    expect(getClientIp(headers)).toBe('203.0.113.7')
  })

  it('usa el primer valor de x-forwarded-for cuando no hay x-real-ip', () => {
    // La cadena es "cliente, proxy1, proxy2": el origen es el primero, y los
    // siguientes son los saltos intermedios.
    const headers = new Headers({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' })
    expect(getClientIp(headers)).toBe('198.51.100.1')
  })

  it('acepta también cabeceras como objeto plano', () => {
    // Es la forma en la que llegan dentro del authorize() de NextAuth, que no
    // recibe un objeto Headers sino un diccionario.
    expect(getClientIp({ 'x-real-ip': '203.0.113.7' })).toBe('203.0.113.7')
    expect(getClientIp({ 'x-forwarded-for': ['198.51.100.1', '10.0.0.1'] })).toBe('198.51.100.1')
  })

  it('devuelve una etiqueta fija cuando no hay ninguna cabecera', () => {
    // Caso de desarrollo local: sin proxy delante no llega ninguna de las dos.
    // Lo importante es que devuelva algo estable y no undefined, porque el
    // valor se concatena para formar la clave del contador.
    expect(getClientIp({})).toBe('desconocida')
    expect(getClientIp(new Headers())).toBe('desconocida')
  })

  it('ignora una cabecera vacía y sigue buscando', () => {
    const headers = new Headers({ 'x-real-ip': '', 'x-forwarded-for': '198.51.100.1' })
    expect(getClientIp(headers)).toBe('198.51.100.1')
  })
})
