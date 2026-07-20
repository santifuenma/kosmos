// ─────────────────────────────────────────────────────────────────────────────
// password.ts — política de contraseñas de Kosmos.
//
// Una única fuente para cliente y servidor. El formulario de registro la usa
// para dar feedback inmediato y el endpoint la vuelve a aplicar porque las
// validaciones de cliente son eludibles; compartir el módulo garantiza que
// ambos exijan lo mismo y muestren el mismo mensaje.
// ─────────────────────────────────────────────────────────────────────────────

export const PASSWORD_MIN_LENGTH = 8

// Texto para placeholders y ayudas del formulario.
export const PASSWORD_HINT = 'Mínimo 8 caracteres, con una mayúscula y un número'

// Devuelve el mensaje del primer requisito incumplido, o null si es válida.
// Comprobamos en orden de menor a mayor esfuerzo para el usuario: primero la
// longitud, que es lo más visible, y luego la composición.
export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string') {
    return 'La contraseña es obligatoria'
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`
  }
  if (!/[A-ZÁÉÍÓÚÜÑ]/.test(password)) {
    return 'La contraseña debe incluir al menos una letra mayúscula'
  }
  if (!/[0-9]/.test(password)) {
    return 'La contraseña debe incluir al menos un número'
  }
  return null
}
