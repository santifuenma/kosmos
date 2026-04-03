// ─────────────────────────────────────────────────────────────────────────────
// api/auth/[...nextauth]/route.ts — handler dinámico de NextAuth.
//
// El segmento `[...nextauth]` es un catch-all que captura todas las subrutas
// bajo /api/auth/: login, logout, callback, session, csrf, providers, etc.
// NextAuth gestiona internamente cada una de estas subrutas según el método
// HTTP (GET o POST) y el path específico.
//
// Exportamos el handler tanto para GET como para POST porque NextAuth usa:
//  - GET para: obtener la sesión actual, listar providers, generar token CSRF
//  - POST para: iniciar sesión con credenciales, cerrar sesión
//
// La configuración real (providers, callbacks, etc.) está en `src/lib/auth.ts`
// para poder importarla también desde Server Components y API routes propias.
// ─────────────────────────────────────────────────────────────────────────────

import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
