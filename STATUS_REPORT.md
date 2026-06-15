# KOSMOS — Informe de Estado

**Generado:** 2026-05-11
**Rama:** `master`
**Next.js:** 16.2.2 (Turbopack) · **Prisma:** 7.6.0 (better-sqlite3 adapter) · **BD:** SQLite (`prisma/dev.db`)

Informe enfocado a cuatro preguntas:
1. Rutas y estado de compilación
2. Errores de TypeScript / runtime
3. Estado de las queries Prisma y sincronización schema ↔ BD
4. Pantallas con datos reales vs. vacías/rotas

---

## 1. Rutas y compilación

`npx next build` ejecutado contra el repo principal: **✅ compila sin errores**.
- `Compiled successfully in 3.4s`
- `Finished TypeScript in 4.1s`
- `Generating static pages 21/21 in 408ms`
- 23 rutas totales (9 páginas + `_not-found` + 13 API routes)

### Páginas (App Router)

| URL | Archivo | Render | Compila |
|---|---|---|---|
| `/` | [src/app/page.tsx](src/app/page.tsx) | ƒ dynamic (redirect server) | ✅ |
| `/login` | [src/app/(auth)/login/page.tsx](src/app/(auth)/login/page.tsx) | ○ static (client) | ✅ |
| `/register` | [src/app/(auth)/register/page.tsx](src/app/(auth)/register/page.tsx) | ○ static (client) | ✅ |
| `/dashboard` | [src/app/(app)/dashboard/page.tsx](src/app/(app)/dashboard/page.tsx) | ƒ dynamic (server) | ✅ |
| `/strategy` | [src/app/(app)/strategy/page.tsx](src/app/(app)/strategy/page.tsx) | ○ static (client) | ✅ |
| `/history` | [src/app/(app)/history/page.tsx](src/app/(app)/history/page.tsx) | ○ static (client) | ✅ |
| `/session/new` | [src/app/(app)/session/new/page.tsx](src/app/(app)/session/new/page.tsx) | ○ static (client) | ✅ |
| `/session/active` | [src/app/(app)/session/active/page.tsx](src/app/(app)/session/active/page.tsx) | ○ static (client) | ✅ |
| `/session/[id]` | [src/app/(app)/session/[id]/page.tsx](src/app/(app)/session/[id]/page.tsx) | ƒ dynamic (server) | ✅ |
| `_not-found` | (auto) | ○ static | ✅ |

### API routes

| Endpoint | Métodos | Archivo | Compila |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | [route.ts](src/app/api/auth/[...nextauth]/route.ts) | ✅ |
| `/api/auth/register` | POST | [route.ts](src/app/api/auth/register/route.ts) | ✅ |
| `/api/strategy` | GET, POST, PUT | [route.ts](src/app/api/strategy/route.ts) | ✅ |
| `/api/strategy/conditions/[id]` | PATCH | [route.ts](src/app/api/strategy/conditions/[id]/route.ts) | ✅ |
| `/api/strategy/rules/[id]` | PATCH | [route.ts](src/app/api/strategy/rules/[id]/route.ts) | ✅ |
| `/api/intention` | GET, POST | [route.ts](src/app/api/intention/route.ts) | ✅ |
| `/api/intention/confirm` | POST | [route.ts](src/app/api/intention/confirm/route.ts) | ✅ |
| `/api/session/active` | GET | [route.ts](src/app/api/session/active/route.ts) | ✅ |
| `/api/session/[id]` | GET | [route.ts](src/app/api/session/[id]/route.ts) | ✅ |
| `/api/session/trade` | POST | [route.ts](src/app/api/session/trade/route.ts) | ✅ |
| `/api/session/close` | POST | [route.ts](src/app/api/session/close/route.ts) | ✅ |
| `/api/history` | GET | [route.ts](src/app/api/history/route.ts) | ✅ |
| `/api/history/weekly` | GET | [route.ts](src/app/api/history/weekly/route.ts) | ✅ |
| `/api/history/feedback` | GET | [route.ts](src/app/api/history/feedback/route.ts) | ✅ |

### Middleware

- [src/proxy.ts](src/proxy.ts) — `withAuth` de NextAuth. Permite `/login`, `/register`, `/api/auth/*`; el resto requiere token JWT.

---

## 2. Errores de TypeScript / runtime

### TypeScript (`npx tsc --noEmit`)
**✅ Sin errores.** El build de Next.js (que también corre el type-check) confirma `Finished TypeScript in 4.1s`.

### ESLint (`npx eslint src`)
**⚠️ 2 errores no bloqueantes** — comillas literales en JSX:

| Archivo | Línea | Regla |
|---|---|---|
| [src/app/(app)/session/active/page.tsx:735](src/app/(app)/session/active/page.tsx:735) | col 52 y 66 | `react/no-unescaped-entities` (`"` debe ser `&quot;`) |

Es texto dentro de `TradeList` que renderiza las notas del trade con comillas literales. No rompe el build (Next.js no falla por warnings de eslint) pero conviene escapar las comillas.

### Runtime
- `getServerSession` se importa correctamente desde `@/lib/auth` en todas las páginas server.
- `Promise<{ id: string }>` se hace `await` antes de leer `params.id` (patrón Next.js 15+) en `/api/strategy/conditions/[id]`, `/api/strategy/rules/[id]`, `/api/session/[id]`, `/session/[id]`.
- El cliente Prisma se inicializa una vez vía `globalThis` ([src/lib/prisma.ts](src/lib/prisma.ts)) para evitar agotar conexiones SQLite en hot-reload.
- No se observan `console.error` ni `throw` no manejados en las rutas inspeccionadas.

### Notas sobre el entorno
- `package.json` ya **no incluye** `tailwindcss` ni `@tailwindcss/postcss`. El proyecto migró a CSS Modules + design tokens en [src/app/globals.css](src/app/globals.css). `postcss.config.mjs` está vacío (`plugins: {}`), consistente con esa decisión.
- Aviso menor del build: "multiple lockfiles detected" — Next.js elige el del repo principal y avisa de los lockfiles dentro de `.claude/worktrees/*`. Se silencia con `turbopack.root` en `next.config.ts` cuando interese.

---

## 3. Prisma — schema ↔ BD

`npx prisma migrate status`:
```
Database schema is up to date!
2 migrations found in prisma/migrations
```

| Migración | Cambios |
|---|---|
| `20260403201632_initial_schema` | 11 modelos del MVP |
| `20260404084152_add_strategy_limits` | añade `maxTrades`, `tradingHoursStart`, `tradingHoursEnd` a `Strategy` |

### Modelos en [prisma/schema.prisma](prisma/schema.prisma)
`User`, `Strategy`, `EntryCondition`, `BehavioralRule`, `StrategyCondition`, `StrategyRule`, `DailyIntention`, `Session`, `Trade`, `TradeViolation`, `SessionViolation`.

### Conteo real en `prisma/dev.db`

| Tabla | Registros |
|---|---|
| `User` | 1 |
| `Strategy` | 1 |
| `StrategyCondition` | 6 |
| `StrategyRule` | 8 |
| `EntryCondition` | 6 (catálogo seed) |
| `BehavioralRule` | 8 (catálogo seed) |
| `DailyIntention` | 11 |
| `Session` | 11 (todas `CLOSED`) |
| `Trade` | 24 |
| `TradeViolation` | 24 |
| `SessionViolation` | 4 |

**Implicación:** los catálogos están sembrados y hay datos de prueba sustanciales generados por [prisma/seed-test-data.ts](prisma/seed-test-data.ts) (no commiteado todavía). **No hay ninguna sesión OPEN ahora mismo**, por lo que `/session/active` redirigirá hoy a `/session/new` hasta que se confirme una intención del día.

### Queries Prisma usadas (estado)

| Query | Endpoint / página | Estado |
|---|---|---|
| `strategy.findUnique({ where: { userId } })` | dashboard, GET/POST/PUT strategy, intention POST, session/active, session/close, session/trade | ✅ |
| `strategy.create({ data, include })` con `conditions.create[]` + `rules.create[]` | POST /api/strategy | ✅ — crea vínculos a todo el catálogo |
| `strategy.updateMany({ where: { userId } })` | PUT /api/strategy | ✅ |
| `strategyCondition.update` / `strategyRule.update` | PATCH toggles | ✅ + verificación de propiedad |
| `dailyIntention.findFirst({ date: gte/lt })` + `findUnique` rango día | dashboard, GET/POST intention, confirm | ✅ |
| `dailyIntention.create({ data })` (copia límites de strategy) | POST /api/intention | ✅ |
| `$transaction([dailyIntention.update, session.create])` | POST /api/intention/confirm | ✅ — confirmación + apertura de sesión atómicas |
| `session.findFirst({ status: OPEN, date rango })` + include trades/violations/intention | GET /api/session/active, POST /api/session/trade, POST /api/session/close, dashboard | ✅ |
| `session.findUnique` + include trades.violations + intention + strategy | GET /api/session/[id], /session/[id] page | ✅ + ownership check |
| `trade.create({ data, violations: { create: [...] } })` mapeando StrategyCondition.id → EntryCondition.id | POST /api/session/trade | ✅ |
| `$transaction(tx => sessionViolation.create + session.update)` con cálculo de ICO | POST /api/session/close | ✅ |
| `session.findMany({ status: CLOSED, date rango })` + count paginado | GET /api/history, /api/history/weekly, /api/history/feedback, dashboard (mensual) | ✅ |
| `session.count` paralelo con `findMany` en Promise.all | GET /api/history | ✅ |

No hay queries con tipos `any`, ni `select` que solicite campos inexistentes en el schema, ni accesos sin `include` a relaciones (verificado leyendo las 14 rutas).

---

## 4. Pantallas con datos reales vs. vacías

Todas las páginas listadas en la sección 1 tienen **código real implementado**. La distinción ahora es entre lo que tiene datos visibles dadas las filas actuales de la BD y lo que aparecería vacío:

| Pantalla | Estado del código | Datos visibles hoy con la BD actual |
|---|---|---|
| `/login`, `/register` | ✅ formulario completo, validación cliente + servidor | N/A (sin sesión) |
| `/dashboard` | ✅ ring SVG ICO + chart semanal + calendario mensual + 5 estados de sesión | ✅ tendrá ring (basado en `lastClosedSession`), calendario con dots de las 11 sesiones, evolución mensual; estado "Sin sesión hoy" salvo que se cree intención |
| `/strategy` | ✅ creación + edición + toggles con optimistic updates + sección "Límites operativos" | ✅ muestra la única `Strategy` (1 user) con sus 6 condiciones y 8 reglas |
| `/session/new` | ✅ resumen de estrategia + 5 botones emocionales + notas + 4 estados (sin intención / pendiente / confirmada-abierta / cerrada) | ✅ muestra el formulario inicial (no hay intención del día) |
| `/session/active` | ✅ stats en vivo + formulario de trade (registro por excepción) + overlay de cierre con auto-marca de `MAX_TRADES_LIMIT` | ⚠️ **redirige a `/session/new`** — 0 sesiones `OPEN` ahora mismo |
| `/session/[id]` | ✅ ring ICO + fórmula con números reales + resumen + desglose cumplimiento + feedback textual | ✅ funcional para cualquiera de las 11 sesiones cerradas |
| `/history` | ✅ resumen semanal con diff vs semana anterior + chart Recharts 8 semanas + feedback con datos reales + lista paginada | ✅ con 11 sesiones cerradas, tanto el chart como la lista tienen contenido |

**Ninguna pantalla está rota y ninguna es placeholder.** La única que mostrará "vacío" hoy es `/session/active`, no por bug sino porque no hay ninguna sesión `OPEN` (el flujo correcto: ir a `/session/new`, crear y confirmar intención → la sesión activa se abre).

---

## Resumen ejecutivo

| Área | Estado |
|---|---|
| Compilación Next.js (23 rutas) | ✅ |
| TypeScript (`tsc --noEmit` + build) | ✅ |
| ESLint | ⚠️ 2 errores cosméticos en `session/active/page.tsx:735` |
| Schema Prisma ↔ BD | ✅ sincronizado (2 migraciones aplicadas) |
| Queries Prisma | ✅ todas válidas, con verificación de propiedad y transacciones donde aplica |
| Catálogos seed (6 condiciones + 8 reglas) | ✅ |
| Datos de prueba (1 user, 11 sesiones, 24 trades, 28 violaciones) | ✅ |
| Pantallas funcionales con datos reales | ✅ las 9 |
| Pantallas vacías / rotas | 0 (solo `/session/active` muestra empty-state lógico) |

Trabajo pendiente sin commitear (`git status`): la mayoría de [src/app/**](src/app/) tiene cambios sin stage (probablemente migración a CSS Modules + nuevos endpoints history/intention/session). Hay 9 `.module.css` y la carpeta [src/app/api/history](src/app/api/history) untracked.
