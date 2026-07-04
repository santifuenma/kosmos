// ─────────────────────────────────────────────────────────────────────────────
// prisma.config.ts — configuración del cliente Prisma 7 para Kosmos.
//
// A partir de Prisma 7, la URL de la base de datos ya no se define en
// schema.prisma sino en este fichero de configuración. Esta separación
// permite tener configuraciones distintas por entorno sin modificar el schema.
//
// La URL también se usa para `prisma migrate dev` y `prisma db seed`, por lo
// que este fichero es la fuente de verdad de la conexión durante el desarrollo.
// ─────────────────────────────────────────────────────────────────────────────

import { defineConfig } from "prisma/config";
// Prisma 7 deja de cargar `.env` automáticamente cuando existe prisma.config.ts,
// así que lo cargamos nosotros para que `process.env.DIRECT_URL` esté disponible
// al ejecutar comandos de la CLI (migrate, db seed).
import "dotenv/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Comando ejecutado por `npx prisma db seed`.
    // Usamos tsx en lugar de ts-node porque tsx es más rápido y compatible
    // con módulos ESM sin configuración adicional.
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    // La CLI de Prisma (migraciones) usa la conexión directa de sesión (:5432),
    // no el pooler de transacción (:6543), que no soporta el protocolo completo
    // que requieren las migraciones.
    url: process.env.DIRECT_URL,
  },
});
