// ─────────────────────────────────────────────────────────────────────────────
// check-demo-readonly.mjs — comprueba que el rol del demo no puede escribir.
//
// Se conecta a Postgres con DEMO_DATABASE_URL (el rol kosmos_demo), igual que
// la app en una sesión de demo, e intenta de todo: escribir, leer datos de
// otros usuarios, leer el hash de la contraseña, quitarse el modo de solo
// lectura, darse permisos… Cada intento debería salir BLOQUEADO u OCULTO.
//
// Uso:  node scripts/check-demo-readonly.mjs
//
// Cada intento va dentro de una transacción que se deshace al final, así que
// aunque algo estuviera mal configurado y una escritura pasara, no quedaría
// guardada. El script termina con código 1 si algo pasó que no debía.
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config'
import pg from 'pg'

const url = process.env.DEMO_DATABASE_URL
if (!url) {
  console.error('Falta DEMO_DATABASE_URL en .env')
  process.exit(1)
}

// El driver pg no entiende el parámetro de Prisma para el pooler.
const client = new pg.Client({ connectionString: url.replace(/[?&]pgbouncer=true/, '') })
await client.connect()

const { rows: [who] } = await client.query('select current_user')
console.log(`Conectado como: ${who.current_user}\n`)

// [descripción, SQL, qué se espera]
//   'bloqueado' → Postgres tiene que dar error
//   'vacío'     → la consulta funciona pero no debe devolver ninguna fila
//   'permitido' → debe funcionar (lo que el demo sí puede hacer)
const attempts = [
  ['Leer sus propias sesiones', `select count(*)::int as n from "Session"`, 'permitido'],
  ['Leer sesiones de otros usuarios', `select * from "Session" where "userId" <> public.kosmos_demo_user_id()`, 'vacío'],
  ['Leer otros usuarios', `select id from "User" where id <> public.kosmos_demo_user_id()`, 'vacío'],
  ['Leer el hash de su contraseña', `select password from "User"`, 'bloqueado'],
  ['Leer tokens de verificación', `select * from "VerificationToken"`, 'bloqueado'],
  ['INSERT de un trade', `insert into "Trade"(id, "sessionId", direction, result) select 'demo-check', id, 'LONG', 'WIN' from "Session" limit 1`, 'bloqueado'],
  ['UPDATE de sus sesiones', `update "Session" set "icoScore" = 0`, 'bloqueado'],
  ['DELETE de sus trades', `delete from "Trade"`, 'bloqueado'],
  ['TRUNCATE de una tabla', `truncate "Trade"`, 'bloqueado'],
  ['Quitarse el modo solo lectura e insertar', `set transaction read write; insert into "Strategy"(id, "userId", name, "updatedAt") values ('demo-check', public.kosmos_demo_user_id(), 'x', now())`, 'bloqueado'],
  ['Darse permiso de INSERT', `grant insert on "Trade" to kosmos_demo`, 'bloqueado'],
  ['Crear una tabla', `create table public.demo_check (id int)`, 'bloqueado'],
]

let failures = 0
for (const [label, sql, expected] of attempts) {
  let outcome
  let detail = ''
  try {
    await client.query('begin')
    const result = await client.query(sql)
    const last = Array.isArray(result) ? result.at(-1) : result
    outcome = last.rows?.length === 0 && last.command === 'SELECT' ? 'vacío' : 'permitido'
    if (last.rows?.[0]?.n !== undefined) detail = `${last.rows[0].n} filas`
  } catch (err) {
    outcome = 'bloqueado'
    detail = err.message
  } finally {
    await client.query('rollback').catch(() => {})
  }

  const ok = outcome === expected
  if (!ok) failures++
  console.log(`${ok ? 'OK   ' : 'FALLO'}  ${label}: ${outcome.toUpperCase()}${detail ? ` (${detail})` : ''}`)
}

await client.end()

console.log(failures === 0
  ? '\nTodo en orden: el rol del demo solo puede leer sus propios datos.'
  : `\n${failures} comprobación(es) no dieron lo esperado. Revisa la migración demo_read_only_role.`)
process.exit(failures === 0 ? 0 : 1)
