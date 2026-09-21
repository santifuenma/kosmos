// ─────────────────────────────────────────────────────────────────────────────
// validation.test.ts — tests de las comprobaciones del cuerpo de la petición.
//
// Son funciones puras, así que se prueban enteras sin base de datos. Lo que
// más importa aquí no es el camino feliz sino los casos raros: son justo los
// que antes convertían una petición mal formada en un 500.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import { optionalText, readJsonBody, requiredText, TEXT_LIMITS } from '@/lib/validation'

function jsonRequest(body: string): Request {
  return new Request('http://localhost/api/test', { method: 'POST', body })
}

describe('readJsonBody', () => {
  it('devuelve el objeto cuando el cuerpo es JSON válido', async () => {
    expect(await readJsonBody(jsonRequest('{"notes":"hola"}'))).toEqual({ notes: 'hola' })
  })

  it('devuelve null con JSON malformado en lugar de lanzar', async () => {
    // Este era el caso que rompía: request.json() lanzaba y el endpoint
    // acababa respondiendo 500 por algo que mandó mal el cliente.
    expect(await readJsonBody(jsonRequest('{roto'))).toBeNull()
    expect(await readJsonBody(jsonRequest(''))).toBeNull()
  })

  it('rechaza un JSON válido que no sea un objeto', async () => {
    // "7" y "[1,2]" son JSON perfectamente válidos, pero los endpoints sacan
    // sus campos por nombre y sobre ellos no hay nombres que sacar.
    expect(await readJsonBody(jsonRequest('7'))).toBeNull()
    expect(await readJsonBody(jsonRequest('[1,2]'))).toBeNull()
    expect(await readJsonBody(jsonRequest('null'))).toBeNull()
  })
})

describe('optionalText', () => {
  it('recorta los espacios', () => {
    expect(optionalText('  hola  ', 'El campo', 10)).toEqual({ ok: true, value: 'hola' })
  })

  it('convierte ausente y vacío en null', () => {
    expect(optionalText(undefined, 'El campo', 10)).toEqual({ ok: true, value: null })
    expect(optionalText(null, 'El campo', 10)).toEqual({ ok: true, value: null })
    expect(optionalText('   ', 'El campo', 10)).toEqual({ ok: true, value: null })
  })

  it('rechaza lo que no sea texto', () => {
    // El caso real: notes llegaba como número y notes?.trim() lanzaba.
    const result = optionalText(42, 'Las notas', 10)
    expect(result.ok).toBe(false)
    expect(result).toHaveProperty('error', 'Las notas debe ser texto')
  })

  it('rechaza lo que pase del máximo', () => {
    const result = optionalText('x'.repeat(2001), 'Las notas', TEXT_LIMITS.notes)
    expect(result.ok).toBe(false)
  })

  it('acepta justo el máximo', () => {
    // El límite es inclusivo: 2000 caracteres valen, 2001 no.
    expect(optionalText('x'.repeat(2000), 'Las notas', TEXT_LIMITS.notes).ok).toBe(true)
  })

  it('mide después de recortar', () => {
    // Los espacios de sobra no deberían gastar presupuesto de caracteres.
    expect(optionalText('  abc  ', 'El campo', 3)).toEqual({ ok: true, value: 'abc' })
  })
})

describe('requiredText', () => {
  it('acepta texto con contenido', () => {
    expect(requiredText('Mi estrategia', 'El nombre', 120)).toEqual({
      ok: true,
      value: 'Mi estrategia',
    })
  })

  it('rechaza ausente, vacío y solo espacios', () => {
    for (const value of [undefined, null, '', '   ']) {
      const result = requiredText(value, 'El nombre', 120)
      expect(result.ok).toBe(false)
      expect(result).toHaveProperty('error', 'El nombre es obligatorio')
    }
  })

  it('mantiene el error de tipo por delante del de obligatorio', () => {
    // Un número no es "falta el campo", es "el campo está mal", y conviene que
    // el mensaje lo diga para no mandar a nadie a rellenar algo que ya rellenó.
    expect(requiredText(42, 'El nombre', 120)).toEqual({
      ok: false,
      error: 'El nombre debe ser texto',
    })
  })
})
