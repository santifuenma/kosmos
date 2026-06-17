// ─────────────────────────────────────────────────────────────────────────────
// vitest.config.ts — configuración de Vitest para los tests unitarios.
//
// Solo testeamos funciones puras (lib/*) que no dependen ni del DOM ni del
// router de Next.js, así que el entorno por defecto `node` es suficiente y
// más rápido que `jsdom`. Replicamos el alias `@/*` de tsconfig.json para
// poder usar las mismas rutas de importación que el resto del código.
// ─────────────────────────────────────────────────────────────────────────────

import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
