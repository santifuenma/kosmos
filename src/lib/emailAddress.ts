// ─────────────────────────────────────────────────────────────────────────────
// emailAddress.ts — política de direcciones de correo de Kosmos.
//
// Mismo papel que `password.ts` para las contraseñas: una única fuente que
// aplican por igual el registro, el inicio de sesión y el reenvío del correo
// de confirmación. Cuando cada endpoint traía su propia versión, la dirección
// se guardaba tal y como se escribió y se buscaba igual, con la consecuencia
// de abajo.
// ─────────────────────────────────────────────────────────────────────────────

// Formato básico. No seguimos la gramática completa del RFC 5321 porque queda
// ilegible y en la práctica solo queremos detectar erratas: la autoridad real
// sobre qué direcciones existen es el servidor de correo, y por eso la cuenta
// no sirve hasta que alguien abre el enlace que le llega.
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Normaliza la dirección antes de guardarla o buscarla.
//
// El @unique de PostgreSQL distingue mayúsculas de minúsculas, así que sin
// esto "Santi@gmail.com" y "santi@gmail.com" son dos cuentas distintas para la
// base de datos y el mismo buzón para el mundo real. Eso permite registrar un
// duplicado de una cuenta ajena cambiando una letra de caja, y deja al dueño
// legítimo sin entender por qué su correo "ya está cogido" o por qué entra en
// una cuenta vacía según cómo lo teclee.
//
// Solo bajamos a minúsculas y recortamos espacios. No tocamos los puntos ni el
// sufijo +etiqueta: que Gmail los ignore es cosa de Gmail, y aplicarlo a todos
// los dominios rompería direcciones legítimas en servidores que sí los
// distinguen.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}
