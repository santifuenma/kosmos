// ─────────────────────────────────────────────────────────────────────────────
// prisma.ts — instancia singleton del cliente Prisma para toda la aplicación.
//
// En Next.js con hot-reload (modo desarrollo), cada vez que un módulo cambia
// Node.js re-evalúa los archivos, lo que crearía una nueva instancia de
// PrismaClient en cada recarga. Cada instancia abre su propio pool de
// conexiones, así que múltiples instancias agotarían rápidamente el límite
// de conexiones del pooler de Supabase.
//
// El patrón singleton resuelve esto guardando la instancia en `globalThis`,
// que persiste entre re-evaluaciones de módulos durante el ciclo de vida del
// proceso Node. En producción (sin hot-reload) se crea siempre una sola
// instancia y el patrón no tiene efecto práctico, pero tampoco perjudica.
// ─────────────────────────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// Tipamos globalThis para poder almacenar la instancia sin que TypeScript
// se queje de que la propiedad `prisma` no existe en el tipo global.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  // Prisma 7 migró de su propio motor Rust a driver adapters de Node.js.
  // Para PostgreSQL usamos `pg` a través del adaptador oficial @prisma/adapter-pg.
  // En runtime la app se conecta por el pooler de transacción de Supabase
  // (DATABASE_URL, puerto 6543), idóneo para entornos serverless como Vercel.
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  return new PrismaClient({ adapter })
}

// Si ya existe una instancia en globalThis la reutilizamos; si no, la creamos.
export const prisma = globalForPrisma.prisma ?? createPrismaClient()

// Solo guardamos en globalThis en desarrollo. En producción es innecesario
// porque el proceso no se reinicia con hot-reload.
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
