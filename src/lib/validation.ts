// ─────────────────────────────────────────────────────────────────────────────
// validation.ts — comprobaciones comunes del cuerpo de las peticiones.
//
// Los endpoints ya validaban lo que les importaba para funcionar (que la
// dirección sea LONG o SHORT, que el estado emocional exista...), pero daban
// por hecho que el resto venía con el tipo correcto y con un tamaño sensato.
// Eso deja dos cabos sueltos:
//
//   · Un campo con el tipo equivocado rompe el handler. `notes?.trim()` sobre
//     un número lanza TypeError, y el error sube sin recoger hasta convertirse
//     en un 500 genérico. No es un agujero de seguridad, pero convierte una
//     petición mal formada en un fallo del servidor en vez de en un 400, que
//     es lo que de verdad ocurrió.
//
//   · Un campo sin tope entra tal cual en la base de datos. Nada impedía
//     guardar unas notas de varios megas, y repitiéndolo se llena el disco de
//     Supabase sin necesidad de explotar nada.
//
// Las funciones devuelven el error en vez de lanzarlo para que cada endpoint
// decida el código de estado, igual que hace con el resto de sus validaciones.
// ─────────────────────────────────────────────────────────────────────────────

// Topes por campo. Son generosos a propósito: están para frenar el abuso, no
// para discutirle al trader lo que quiere escribir en sus notas.
export const TEXT_LIMITS = {
  strategyName: 120,
  label: 120,
  description: 500,
  notes: 2000,
  asset: 20,
} as const

export type TextResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string }

// Igual que TextResult pero sin el null: si la comprobación pasa, hay texto.
// Tenerlo como tipo aparte evita que quien llama a requiredText tenga que
// volver a descartar el null que la propia función ya ha descartado.
export type RequiredTextResult =
  | { ok: true; value: string }
  | { ok: false; error: string }

// Lee el cuerpo como JSON. Devuelve null si no lo es.
//
// Sin esto, `await request.json()` sobre un cuerpo malformado lanza y el
// endpoint responde 500: decimos que el servidor falló cuando lo que pasó es
// que el cliente mandó basura.
export async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    // Un JSON válido puede ser un número o un array; aquí solo nos sirve un
    // objeto, porque es de donde los endpoints sacan sus campos por nombre.
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return null
    }
    return body as Record<string, unknown>
  } catch {
    return null
  }
}

// Campo de texto que puede no venir.
//
// Ausente o vacío devuelve null, que es lo que esperan las columnas opcionales
// del esquema. Un tipo que no sea cadena se rechaza en lugar de intentar
// convertirlo: si el cliente manda un número donde va texto, es un error suyo
// y conviene que se entere.
export function optionalText(
  value: unknown,
  fieldName: string,
  maxLength: number,
): TextResult {
  if (value === undefined || value === null) return { ok: true, value: null }

  if (typeof value !== 'string') {
    return { ok: false, error: `${fieldName} debe ser texto` }
  }

  const trimmed = value.trim()
  if (trimmed.length > maxLength) {
    return {
      ok: false,
      error: `${fieldName} no puede superar los ${maxLength} caracteres`,
    }
  }

  return { ok: true, value: trimmed || null }
}

// Campo de texto obligatorio. Mismas reglas, pero vacío no vale.
export function requiredText(
  value: unknown,
  fieldName: string,
  maxLength: number,
): RequiredTextResult {
  const result = optionalText(value, fieldName, maxLength)
  if (!result.ok) return result

  if (result.value === null) {
    return { ok: false, error: `${fieldName} es obligatorio` }
  }

  return { ok: true, value: result.value }
}
