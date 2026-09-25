// ─────────────────────────────────────────────────────────────────────────────
// demo.ts — quién es el usuario del demo público.
//
// El demo es una cuenta normal (la que sembró prisma/seed-testuser.ts) que se
// trata como de solo lectura. Lo reconocemos por el correo y no por el id
// porque el id cambia de una base de datos a otra, y porque el correo ya viaja
// en el token de sesión: el proxy puede comprobarlo sin consultar nada.
//
// El mismo correo aparece en la migración que crea el rol kosmos_demo
// (función kosmos_demo_user_id). Si se cambia aquí hay que cambiarlo allí.
//
// Este fichero lo importa el proxy, que corre en el Edge Runtime: no puede
// importar Prisma ni nada de Node.
// ─────────────────────────────────────────────────────────────────────────────

export const DEMO_USER_EMAIL = 'usuarioprueba@gmail.com'

// Da igual cómo haya entrado la sesión (botón "Ver demo" o el formulario de
// login con la contraseña del demo): si es esta cuenta, es de solo lectura.
export function isDemoUser(email: string | null | undefined): boolean {
  return email === DEMO_USER_EMAIL
}
