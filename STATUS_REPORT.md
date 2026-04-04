# KOSMOS — Informe de Estado del Proyecto

> **Fecha de generación:** 2026-04-04  
> **Versión de Next.js:** 16.2.2  
> **Versión de Prisma:** 7.6.0  
> **Entorno:** Desarrollo local (SQLite)

---

## 1. Estructura del Proyecto

```
src/
├── app/
│   ├── (app)/                          # Grupo de rutas protegidas (con Navbar)
│   │   ├── layout.tsx                  # Layout con Navbar para todas las rutas protegidas
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── history/
│   │   │   └── page.tsx
│   │   ├── session/
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx
│   │   │   ├── active/
│   │   │   │   └── page.tsx
│   │   │   └── new/
│   │   │       └── page.tsx
│   │   └── strategy/
│   │       └── page.tsx
│   ├── (auth)/                         # Grupo de rutas de autenticación (sin Navbar)
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── register/
│   │       └── page.tsx
│   ├── api/
│   │   ├── auth/
│   │   │   ├── [...nextauth]/
│   │   │   │   └── route.ts
│   │   │   └── register/
│   │   │       └── route.ts
│   │   └── strategy/
│   │       ├── route.ts
│   │       ├── conditions/
│   │       │   └── [id]/
│   │       │       └── route.ts
│   │       └── rules/
│   │           └── [id]/
│   │               └── route.ts
│   ├── favicon.ico
│   ├── globals.css
│   ├── layout.tsx                      # Layout raíz (SessionProvider global)
│   └── page.tsx                        # Redirect raíz → /dashboard o /login
├── components/
│   ├── layout/
│   │   ├── Navbar.tsx
│   │   └── SessionProvider.tsx
│   └── ui/                             # Vacío — pendiente de implementar
├── lib/
│   ├── auth.ts                         # Configuración NextAuth + getServerSession
│   ├── prisma.ts                       # Cliente Prisma singleton
│   └── utils.ts                        # Función cn()
├── proxy.ts                            # Middleware de protección de rutas (Next.js 16)
└── types/
    ├── index.ts                        # Tipos compartidos del dominio
    └── next-auth.d.ts                  # Extensión de tipos de NextAuth
```

---

## 2. Estado del Build

**Resultado: ✅ BUILD EXITOSO — sin errores ni warnings**

```
▲ Next.js 16.2.2 (Turbopack)
✓ Compiled successfully in 3.9s
✓ TypeScript check passed in 5.0s
✓ 13 páginas generadas correctamente

Route (app)
┌ ƒ /                          Dynamic (redirect)
├ ○ /_not-found                Static
├ ƒ /api/auth/[...nextauth]    Dynamic
├ ƒ /api/auth/register         Dynamic
├ ƒ /api/strategy              Dynamic
├ ƒ /api/strategy/conditions/[id]  Dynamic
├ ƒ /api/strategy/rules/[id]   Dynamic
├ ƒ /dashboard                 Dynamic (Server Component con DB query)
├ ○ /history                   Static (placeholder)
├ ○ /login                     Static
├ ○ /register                  Static
├ ƒ /session/[id]              Dynamic
├ ○ /session/active            Static (placeholder)
├ ○ /session/new               Static (placeholder)
└ ○ /strategy                  Static (shell; datos se cargan en cliente)

ƒ Proxy (Middleware) activo
```

---

## 3. Esquema de Base de Datos

```prisma
// schema.prisma — 11 modelos definidos

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  // URL configurada en prisma.config.ts (Prisma 7)
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String                    // Hash bcrypt
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  strategy       Strategy?
  dailyIntention DailyIntention[]
  sessions       Session[]
}

model Strategy {
  id          String   @id @default(cuid())
  userId      String   @unique         // Máximo 1 estrategia por usuario (MVP)
  name        String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user       User                @relation(..., onDelete: Cascade)
  conditions StrategyCondition[]
  rules      StrategyRule[]
}

// ── Catálogos del sistema (datos maestros, gestionados por seed) ──

model EntryCondition {
  id          String @id @default(cuid())
  code        String @unique
  label       String
  description String

  strategyConditions StrategyCondition[]
  tradeViolations    TradeViolation[]
}

model BehavioralRule {
  id          String @id @default(cuid())
  code        String @unique
  label       String
  description String
  scope       String  // "PER_TRADE" | "PER_SESSION"

  strategyRules     StrategyRule[]
  tradeViolations   TradeViolation[]
  sessionViolations SessionViolation[]
}

// ── Tablas intermedias de estrategia ──

model StrategyCondition {
  id          String  @id @default(cuid())
  strategyId  String
  conditionId String
  isActive    Boolean @default(true)

  strategy  Strategy       @relation(..., onDelete: Cascade)
  condition EntryCondition @relation(...)

  @@unique([strategyId, conditionId])
}

model StrategyRule {
  id         String  @id @default(cuid())
  strategyId String
  ruleId     String
  isActive   Boolean @default(true)

  strategy Strategy       @relation(..., onDelete: Cascade)
  rule     BehavioralRule @relation(...)

  @@unique([strategyId, ruleId])
}

// ── Intención diaria y sesiones ──

model DailyIntention {
  id                String    @id @default(cuid())
  userId            String
  strategyId        String
  date              DateTime
  maxTrades         Int
  tradingHoursStart String
  tradingHoursEnd   String
  emotionalState    String    // "NEUTRAL"|"ANXIOUS"|"CONFIDENT"|"FRUSTRATED"|"TIRED"
  notes             String?
  confirmedAt       DateTime?
  createdAt         DateTime  @default(now())

  user    User     @relation(..., onDelete: Cascade)
  session Session?

  @@unique([userId, date])   // Una intención por día por usuario
}

model Session {
  id          String    @id @default(cuid())
  userId      String
  intentionId String    @unique
  date        DateTime
  status      String    @default("OPEN")  // "OPEN" | "CLOSED"
  icoScore    Float?                      // null hasta que se cierra la sesión
  createdAt   DateTime  @default(now())
  closedAt    DateTime?

  user       User              @relation(..., onDelete: Cascade)
  intention  DailyIntention    @relation(...)
  trades     Trade[]
  violations SessionViolation[]
}

// ── Operaciones y violaciones ──

model Trade {
  id        String   @id @default(cuid())
  sessionId String
  timestamp DateTime @default(now())
  direction String   // "LONG" | "SHORT"
  result    String   // "WIN" | "LOSS" | "BREAKEVEN"
  pnlAmount Float?
  notes     String?
  createdAt DateTime @default(now())

  session    Session          @relation(..., onDelete: Cascade)
  violations TradeViolation[]
}

model TradeViolation {
  id          String   @id @default(cuid())
  tradeId     String
  ruleId      String?       // Relleno si es RULE_VIOLATION
  conditionId String?       // Relleno si es CONDITION_VIOLATION
  type        String        // "RULE_VIOLATION" | "CONDITION_VIOLATION"
  createdAt   DateTime @default(now())

  trade     Trade           @relation(..., onDelete: Cascade)
  rule      BehavioralRule? @relation(...)
  condition EntryCondition? @relation(...)
}

model SessionViolation {
  id        String   @id @default(cuid())
  sessionId String
  ruleId    String   // Siempre PER_SESSION
  createdAt DateTime @default(now())

  session Session        @relation(..., onDelete: Cascade)
  rule    BehavioralRule @relation(...)
}
```

**Migración aplicada:** `20260403201632_initial_schema`

---

## 4. Dependencias Instaladas

### dependencies (producción)

| Paquete | Versión | Uso |
|---|---|---|
| `next` | 16.2.2 | Framework principal |
| `react` / `react-dom` | 19.2.4 | UI |
| `next-auth` | ^4.24.13 | Autenticación (JWT + Credentials) |
| `@auth/prisma-adapter` | ^2.11.1 | Instalado, **pendiente de uso** (no necesario con JWT) |
| `prisma` | ^7.6.0 | ORM — CLI y motor |
| `@prisma/client` | ^7.6.0 | Cliente de base de datos |
| `@prisma/adapter-better-sqlite3` | ^7.6.0 | Driver adapter para SQLite (Prisma 7) |
| `better-sqlite3` | ^12.8.0 | Driver SQLite nativo |
| `bcryptjs` | ^3.0.3 | Hashing de contraseñas |
| `recharts` | ^3.8.1 | Instalado, **pendiente de uso** (gráficas de ICO) |

### devDependencies

| Paquete | Versión | Uso |
|---|---|---|
| `typescript` | ^5 | Tipado estático |
| `tsx` | ^4.21.0 | Ejecutar TypeScript en Node (seed) |
| `tailwindcss` | ^4 | Estilos |
| `@tailwindcss/postcss` | ^4 | Plugin de PostCSS para Tailwind |
| `eslint` / `eslint-config-next` | ^9 / 16.2.2 | Linting |
| `@types/node` | ^20 | Tipos Node.js |
| `@types/react` / `@types/react-dom` | ^19 | Tipos React |
| `@types/bcryptjs` | ^2.4.6 | Tipos bcryptjs |
| `@types/better-sqlite3` | ^7.6.13 | Tipos better-sqlite3 |

---

## 5. API Routes Implementadas

| Ruta | Métodos | Descripción |
|---|---|---|
| `/api/auth/[...nextauth]` | `GET`, `POST` | Catch-all de NextAuth: gestiona login, logout, sesión, CSRF y callbacks internos |
| `/api/auth/register` | `POST` | Registro de nuevos usuarios: valida datos, hashea contraseña con bcrypt y crea el usuario en BD |
| `/api/strategy` | `GET` | Devuelve la estrategia del usuario autenticado con todas sus condiciones y reglas expandidas |
| `/api/strategy` | `POST` | Crea la estrategia del usuario y la vincula automáticamente con todo el catálogo (`isActive: false`) |
| `/api/strategy` | `PUT` | Actualización parcial de nombre y/o descripción de la estrategia |
| `/api/strategy/conditions/[id]` | `PATCH` | Toggle `isActive` de un `StrategyCondition`; verifica que pertenezca al usuario autenticado |
| `/api/strategy/rules/[id]` | `PATCH` | Toggle `isActive` de un `StrategyRule`; verifica que pertenezca al usuario autenticado |

**Endpoints pendientes de implementar:**
- `POST /api/session` — crear sesión a partir de una intención diaria
- `PATCH /api/session/[id]/close` — cerrar sesión y calcular ICO
- `POST /api/session/[id]/trade` — registrar operación en sesión abierta
- `POST /api/intention` — crear intención diaria
- `GET /api/history` — listar sesiones cerradas con ICO

---

## 6. Páginas Implementadas

| Ruta URL | Archivo | Tipo | Descripción |
|---|---|---|---|
| `/` | `app/page.tsx` | Server Component | Redirect a `/dashboard` o `/login` según sesión |
| `/login` | `(auth)/login/page.tsx` | **Client Component** | Formulario de login con `signIn('credentials')` |
| `/register` | `(auth)/register/page.tsx` | **Client Component** | Formulario de registro con auto-login tras creación |
| `/dashboard` | `(app)/dashboard/page.tsx` | Server Component | Muestra estado de la estrategia; aviso si no existe |
| `/strategy` | `(app)/strategy/page.tsx` | **Client Component** | Gestión completa de estrategia: crear/editar nombre, toggles de condiciones y reglas con optimistic update |
| `/history` | `(app)/history/page.tsx` | Server Component | **Placeholder** — sin implementar |
| `/session/new` | `(app)/session/new/page.tsx` | Server Component | **Placeholder** — sin implementar |
| `/session/active` | `(app)/session/active/page.tsx` | Server Component | **Placeholder** — sin implementar |
| `/session/[id]` | `(app)/session/[id]/page.tsx` | Server Component | **Placeholder** — sin implementar |

---

## 7. Componentes Creados

| Componente | Archivo | Tipo | Descripción |
|---|---|---|---|
| `Navbar` | `components/layout/Navbar.tsx` | **Client Component** | Barra de navegación para páginas protegidas: logo, links (con link activo destacado por pathname), nombre de usuario y botón de cierre de sesión |
| `SessionProvider` | `components/layout/SessionProvider.tsx` | **Client Component** | Wrapper del `SessionProvider` de NextAuth; permite usar `useSession()` desde cualquier Client Component sin convertir el layout raíz en cliente |

**Pendiente de implementar:**
- `src/components/ui/` — carpeta creada y vacía; aquí irán botones, inputs, cards reutilizables

---

## 8. Estado de la Autenticación

| Aspecto | Estado |
|---|---|
| **Sistema** | NextAuth.js v4.24.13 |
| **Provider** | `CredentialsProvider` (email + contraseña) — sin OAuth |
| **Estrategia de sesión** | JWT (cookie `next-auth.session-token` httpOnly) |
| **Almacenamiento de sesión** | No se persiste en BD — el token JWT es autónomo |
| **Hashing de contraseñas** | bcrypt con 10 salt rounds |
| **Configuración** | `src/lib/auth.ts` → importado por el handler y Server Components |
| **Handler NextAuth** | `src/app/api/auth/[...nextauth]/route.ts` |
| **Middleware de protección** | ✅ **Activo** — `src/proxy.ts` (nombre Next.js 16) |
| **Rutas protegidas** | Todas excepto `/login`, `/register`, `/api/auth/*` y archivos estáticos |
| **Redirect si no autenticado** | → `/login` |
| **Redirect si autenticado accede a /login** | → `/dashboard` |
| **Extensión de tipos** | `session.user.id` disponible en todo el código (via `src/types/next-auth.d.ts`) |

---

## 9. Datos en Base de Datos

El seed se ejecutó correctamente. Registros actuales:

### Catálogos del sistema

**EntryCondition — 6 registros**

| code | label |
|---|---|
| `TREND_CONFIRM` | Tendencia Confirmada |
| `SR_LEVEL` | Nivel S/R |
| `VOLUME_CONFIRM` | Volumen OK |
| `INDICATOR_SIGNAL` | Señal de Indicador |
| `PATTERN_FORMED` | Patrón Formado |
| `RR_ACCEPTABLE` | R:R Aceptable |

**BehavioralRule — 8 registros**

| code | label | scope |
|---|---|---|
| `NO_SL_MODIFY` | Mantener SL | PER_TRADE |
| `CONDITIONS_MET` | Condiciones OK | PER_TRADE |
| `NO_IMPULSE_ENTRY` | Sin Impulso | PER_TRADE |
| `NO_EARLY_EXIT` | Sin Salida Prematura | PER_TRADE |
| `MAX_TRADES_LIMIT` | Máx. Operaciones | PER_SESSION |
| `TRADING_HOURS` | Horario OK | PER_SESSION |
| `NO_REVENGE_TRADE` | Sin Venganza | PER_SESSION |
| `STRATEGY_FOLLOWED` | Estrategia OK | PER_SESSION |

### Datos de usuario (BD de desarrollo)

| Tabla | Registros |
|---|---|
| `User` | 1 (usuario de prueba creado durante las verificaciones) |
| `Strategy` | 1 (estrategia del usuario de prueba) |
| `DailyIntention` | 0 |
| `Session` | 0 |
| `Trade` | 0 |

---

## 10. Problemas Detectados

### ⚠️ Menores — no bloquean el desarrollo

**1. `@auth/prisma-adapter` instalado pero sin usar**
- **Archivo:** `package.json`
- **Detalle:** El paquete `@auth/prisma-adapter@2.11.1` está en las dependencias de producción pero no se importa en ningún archivo. Al usar la estrategia JWT con Credentials provider no se necesita un adaptador de base de datos para las sesiones. Ocupa espacio en el bundle de forma innecesaria.
- **Impacto:** Ninguno en funcionalidad. Tamaño de `node_modules` ligeramente mayor.
- **Acción sugerida:** Desinstalar con `npm uninstall @auth/prisma-adapter` cuando se confirme que no se migrará a sesiones en BD.

**2. `recharts` instalado pero sin usar**
- **Archivo:** `package.json`
- **Detalle:** La librería de gráficas `recharts@3.8.1` está instalada pero no hay ningún componente que la importe todavía.
- **Impacto:** Ninguno en funcionalidad. Está planificada para los gráficos del ICO en el historial.
- **Acción sugerida:** Sin acción — se usará en la implementación del historial.

**3. `"prisma": { "seed": "..." }` en `package.json` es ignorado por Prisma 7**
- **Archivo:** `package.json` (línea 24)
- **Detalle:** En Prisma 7 la configuración del seed se lee desde `prisma.config.ts` (campo `migrations.seed`), no desde `package.json`. La entrada en `package.json` no tiene efecto pero puede confundir a quien lea el código.
- **Impacto:** Ninguno — `npx prisma db seed` funciona correctamente porque lee `prisma.config.ts`.
- **Acción sugerida:** Eliminar el bloque `"prisma"` de `package.json` para evitar confusión.

**4. Carpeta `src/components/ui/` vacía**
- **Detalle:** Se creó durante la inicialización del proyecto pero no contiene componentes todavía.
- **Impacto:** Ninguno. Es la carpeta destinada a los componentes UI reutilizables (botones, inputs, cards) que se crearán en siguientes iteraciones.
- **Acción sugerida:** Sin acción — se poblará en el diseño final.

**5. Páginas placeholder sin contenido real**
- **Archivos:** `session/new/page.tsx`, `session/active/page.tsx`, `session/[id]/page.tsx`, `history/page.tsx`
- **Detalle:** Estas páginas devuelven solo un `<div>` con texto "En construcción". Están protegidas por el middleware y aparecen en la Navbar pero no tienen funcionalidad.
- **Impacto:** Ninguno — son parte del desarrollo incremental planificado.
- **Acción sugerida:** Implementar en los siguientes prompts del TFG.

### ✅ Sin problemas críticos

- No hay imports rotos
- No hay tipos TypeScript incorrectos (`tsc` pasa sin errores)
- La base de datos tiene los catálogos correctos
- El middleware de protección de rutas está activo y funciona
- Todos los endpoints de la API validan la sesión antes de operar

---

## Historial de Commits

```
9fb95fd  Add comprehensive comments across all source files
bb68b8e  Add strategy management (API + UI)
ba22249  Add NextAuth credentials authentication
d5f6481  Add Prisma schema and catalogue seed
14fa3ca  Fix Prisma 7 compatibility: use better-sqlite3 driver adapter
8c3782a  Initial project structure
fcd8e20  Initial commit from Create Next App
```

---

## Resumen Ejecutivo

| Área | Estado |
|---|---|
| Infraestructura Next.js | ✅ Completa |
| Base de datos (Prisma + SQLite) | ✅ Completa |
| Esquema de BD (11 modelos) | ✅ Completo |
| Datos maestros (seed) | ✅ 6 condiciones + 8 reglas |
| Autenticación (NextAuth JWT) | ✅ Completa |
| Registro de usuarios | ✅ Completo |
| Protección de rutas (proxy) | ✅ Activo |
| Gestión de estrategia | ✅ Completa |
| Intención diaria | ⏳ Pendiente |
| Registro de sesiones y trades | ⏳ Pendiente |
| Cálculo del ICO | ⏳ Pendiente |
| Historial y análisis | ⏳ Pendiente |
| Diseño visual final | ⏳ Pendiente |
