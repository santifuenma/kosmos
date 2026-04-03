// ─────────────────────────────────────────────────────────────────────────────
// next-auth.d.ts — extensión de los tipos de NextAuth para añadir `id` al usuario.
//
// Por defecto, el tipo `Session` de NextAuth define `user` con solo `name`,
// `email` e `image`. Sin embargo, en Kosmos necesitamos el `id` del usuario
// en prácticamente todas las queries a la base de datos.
//
// TypeScript permite ampliar tipos de módulos externos con `declare module`.
// Esta declaración fusiona nuestra extensión con el tipo original de NextAuth
// en tiempo de compilación, sin modificar la librería. El valor de `id`
// proviene del callback `session` en `src/lib/auth.ts`, donde lo propagamos
// desde el JWT al objeto de sesión.
// ─────────────────────────────────────────────────────────────────────────────

import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
    } & DefaultSession['user'] // Mantenemos los campos originales (name, email, image)
  }
}
