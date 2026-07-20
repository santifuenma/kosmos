// ─────────────────────────────────────────────────────────────────────────────
// next-auth.d.ts — extensión de los tipos de NextAuth.
//
// Por defecto, el tipo `Session` de NextAuth define `user` con solo `name`,
// `email` e `image`. En Kosmos necesitamos además:
//   - `id`, presente en prácticamente todas las queries a la base de datos
//   - `firstName` / `lastName`, porque la interfaz se dirige al trader solo
//     por el nombre de pila
//   - `gender`, que determina la concordancia gramatical de los textos que se
//     refieren al usuario (ver src/lib/gender.ts)
//
// TypeScript permite ampliar tipos de módulos externos con `declare module`.
// Esta declaración fusiona nuestra extensión con el tipo original de NextAuth
// en tiempo de compilación, sin modificar la librería. Los valores provienen
// de los callbacks `jwt` y `session` en `src/lib/auth.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { DefaultSession } from 'next-auth'
import type { Gender } from '@/lib/gender'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      firstName: string
      lastName: string
      gender: Gender
    } & DefaultSession['user'] // Mantenemos los campos originales (name, email, image)
  }

  // El objeto que devuelve `authorize()` y que recibe el callback `jwt`.
  interface User {
    firstName: string
    lastName: string
    gender: Gender
  }
}
