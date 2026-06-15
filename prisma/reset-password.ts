// ─────────────────────────────────────────────────────────────────────────────
// reset-password.ts — script de emergencia para resetear la contraseña de un
// usuario en desarrollo. No hay flujo de recuperación en la app (MVP).
//
// Uso:
//   npx tsx prisma/reset-password.ts <email> <nueva-contraseña>
//
// Ejemplo:
//   npx tsx prisma/reset-password.ts sanfuenmayor@gmail.com MiNuevoPass123
//
// Hashea con bcrypt 10 rounds, exactamente igual que /api/auth/register.
// ─────────────────────────────────────────────────────────────────────────────

import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'

async function main() {
  const [email, password] = process.argv.slice(2)

  if (!email || !password) {
    console.error('Uso: npx tsx prisma/reset-password.ts <email> <nueva-contraseña>')
    process.exit(1)
  }
  if (password.length < 6) {
    console.error('La contraseña debe tener al menos 6 caracteres.')
    process.exit(1)
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    console.error(`Usuario no encontrado: ${email}`)
    process.exit(1)
  }

  const hash = await bcrypt.hash(password, 10)
  await prisma.user.update({
    where: { email },
    data: { password: hash },
  })

  console.log(`✓ Contraseña actualizada para ${email}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
