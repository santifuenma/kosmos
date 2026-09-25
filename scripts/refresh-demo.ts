// ─────────────────────────────────────────────────────────────────────────────
// refresh-demo.ts — regenera ya el historial del demo.
//
// El demo se regenera solo la primera vez que alguien entra cada día. Esto es
// para forzarlo a mano, por ejemplo después de cambiar src/lib/demoDataset.ts.
//
// Uso:  npm run demo:refresh
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config'
import { ensureDemoDataFresh } from '../src/lib/demoRefresh'
import { prisma } from '../src/lib/prisma'
import { DEMO_USER_EMAIL } from '../src/lib/demo'

async function main() {
  await ensureDemoDataFresh({ force: true })

  const user = await prisma.user.findUnique({
    where: { email: DEMO_USER_EMAIL },
    select: { _count: { select: { sessions: true } }, strategy: { select: { name: true } } },
  })
  console.log(`Estrategia: ${user?.strategy?.name}`)
  console.log(`Sesiones del demo: ${user?._count.sessions}`)
}

main().finally(() => prisma.$disconnect())
