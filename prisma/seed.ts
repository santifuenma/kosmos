import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'node:path'

const dbPath = path.join(process.cwd(), 'prisma', 'dev.db')
const adapter = new PrismaBetterSqlite3({ url: dbPath })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding catalogues...')

  // Limpiar datos existentes para poder re-ejecutar
  await prisma.tradeViolation.deleteMany()
  await prisma.sessionViolation.deleteMany()
  await prisma.strategyCondition.deleteMany()
  await prisma.strategyRule.deleteMany()
  await prisma.entryCondition.deleteMany()
  await prisma.behavioralRule.deleteMany()

  // ─── EntryCondition catalogue ───────────────────────────────────────────────
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

  // ─── BehavioralRule catalogue ────────────────────────────────────────────────
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
    await prisma.$disconnect()
  })
