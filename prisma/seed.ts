// ─────────────────────────────────────────────────────────────────────────────
// seed.ts — datos maestros iniciales de los catálogos del sistema.
//
// Los catálogos EntryCondition y BehavioralRule son datos del sistema, no del
// usuario: los define el equipo de Kosmos y son iguales para todos los traders.
// Sin estos datos, la plataforma no puede funcionar porque los usuarios necesitan
// seleccionar condiciones y reglas al configurar su estrategia.
//
// El seed es idempotente: borra y recrea los registros en cada ejecución.
// Esto permite actualizar los catálogos sin migraciones de esquema complejas.
//
// Para ejecutar: `npx prisma db seed` (configurado en prisma.config.ts)
// ─────────────────────────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'node:path'

// Creamos el cliente directamente (sin el singleton de src/lib/prisma.ts)
// porque el seed se ejecuta fuera del contexto de Next.js y no hay riesgo
// de múltiples instancias con hot-reload.
const dbPath = path.join(process.cwd(), 'prisma', 'dev.db')
const adapter = new PrismaBetterSqlite3({ url: dbPath })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding catalogues...')

  // Borramos en orden inverso de dependencias para respetar las foreign keys.
  // TradeViolation y SessionViolation apuntan a los catálogos, por lo que
  // deben eliminarse antes que EntryCondition y BehavioralRule.
  // StrategyCondition y StrategyRule también referencian los catálogos.
  await prisma.tradeViolation.deleteMany()
  await prisma.sessionViolation.deleteMany()
  await prisma.strategyCondition.deleteMany()
  await prisma.strategyRule.deleteMany()
  await prisma.entryCondition.deleteMany()
  await prisma.behavioralRule.deleteMany()

  // ── Catálogo de condiciones de entrada ──────────────────────────────────────
  // Cada condición representa un requisito técnico que el trader puede exigirse
  // antes de entrar en una operación. El trader activa en su estrategia solo
  // las que aplican a su metodología.
  const conditions = await prisma.entryCondition.createMany({
    data: [
      {
        code: 'TREND_CONFIRM',
        label: 'Tendencia Confirmada',
        description:
          'La acción del precio confirma la dirección de tendencia esperada antes de entrar',
      },
      {
        code: 'SR_LEVEL',
        label: 'Nivel S/R',
        description:
          'El precio se encuentra en un nivel relevante de soporte o resistencia',
      },
      {
        code: 'VOLUME_CONFIRM',
        label: 'Volumen OK',
        description: 'El volumen es adecuado para confirmar el setup',
      },
      {
        code: 'INDICATOR_SIGNAL',
        label: 'Señal de Indicador',
        description:
          'Los indicadores técnicos definidos en la estrategia dan una señal válida',
      },
      {
        code: 'PATTERN_FORMED',
        label: 'Patrón Formado',
        description:
          'Un patrón chartístico o de velas se ha formado completamente',
      },
      {
        code: 'RR_ACCEPTABLE',
        label: 'R:R Aceptable',
        description:
          'La ratio riesgo-beneficio cumple el mínimo definido en la estrategia',
      },
    ],
  })

  // ── Catálogo de reglas conductuales ─────────────────────────────────────────
  // Las reglas definen compromisos de comportamiento del trader durante la sesión.
  // Se dividen en dos scopes:
  //   PER_TRADE: se evalúan para cada operación individual
  //   PER_SESSION: se evalúan una sola vez al cerrar la sesión completa
  const rules = await prisma.behavioralRule.createMany({
    data: [
      {
        code: 'NO_SL_MODIFY',
        label: 'Mantener SL',
        scope: 'PER_TRADE',
        description:
          'No modificar ni eliminar el stop-loss una vez establecido',
      },
      {
        code: 'CONDITIONS_MET',
        label: 'Condiciones OK',
        scope: 'PER_TRADE',
        description:
          'Solo entrar cuando todas las condiciones de entrada activas se cumplen',
      },
      {
        code: 'NO_IMPULSE_ENTRY',
        label: 'Sin Impulso',
        scope: 'PER_TRADE',
        description:
          'La entrada fue deliberada, no motivada por impulso o FOMO',
      },
      {
        code: 'NO_EARLY_EXIT',
        label: 'Sin Salida Prematura',
        scope: 'PER_TRADE',
        description:
          'No cerró la posición antes de tiempo por miedo',
      },
      {
        code: 'MAX_TRADES_LIMIT',
        label: 'Máx. Operaciones',
        scope: 'PER_SESSION',
        description:
          'No superó el número máximo de operaciones definido en la intención diaria',
      },
      {
        code: 'TRADING_HOURS',
        label: 'Horario OK',
        scope: 'PER_SESSION',
        description:
          'Todas las operaciones se ejecutaron dentro del horario definido',
      },
      {
        code: 'NO_REVENGE_TRADE',
        label: 'Sin Venganza',
        scope: 'PER_SESSION',
        description:
          'No entró en operaciones motivado por recuperar una pérdida anterior',
      },
      {
        code: 'STRATEGY_FOLLOWED',
        label: 'Estrategia OK',
        scope: 'PER_SESSION',
        description:
          'No cambió ni modificó la estrategia durante la sesión',
      },
    ],
  })

  console.log(`✓ ${conditions.count} EntryConditions created`)
  console.log(`✓ ${rules.count} BehavioralRules created`)
  console.log('Seed completed successfully.')
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    // Cerramos la conexión a la BD al terminar para que el proceso Node
    // pueda finalizar limpiamente sin quedarse colgado esperando conexiones.
    await prisma.$disconnect()
  })
