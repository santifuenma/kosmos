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
import path from "node:path";

// Construimos la ruta absoluta al fichero SQLite.
// Usamos path.join en lugar de una ruta relativa para que funcione
// independientemente del directorio desde el que se ejecuten los comandos CLI.
const dbPath = path.join(process.cwd(), "prisma", "dev.db");

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
    // Protocolo `file:` indica a SQLite que use un fichero local.
    // El path absoluto evita ambigüedades al ejecutar comandos desde distintos directorios.
    url: `file:${dbPath}`,
  },
});
