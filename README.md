# KOSMOS

Plataforma de análisis conductual para traders novatos. Mide la **disciplina operativa** —no el resultado financiero— mediante el **ICO (Índice de Coherencia Operativa)**: la ratio entre lo que el trader planificó hacer y lo que realmente hizo en cada sesión.

Trabajo Fin de Grado de Santiago Fuenmayor.

---

## Tabla de contenidos

- [Idea](#idea)
- [Stack](#stack)
- [Arquitectura](#arquitectura)
- [Modelo de datos](#modelo-de-datos)
- [Cálculo del ICO](#cálculo-del-ico)
- [Requisitos](#requisitos)
- [Puesta en marcha](#puesta-en-marcha)
- [Scripts disponibles](#scripts-disponibles)
- [Variables de entorno](#variables-de-entorno)
- [Estructura del repositorio](#estructura-del-repositorio)

## Idea

Los traders novatos pierden, en su mayoría, no por falta de conocimiento técnico sino por **falta de disciplina**: improvisan entradas, mueven el stop-loss, operan fuera de horario o ignoran reglas que ellos mismos se impusieron. Kosmos mide ese gap entre la **estrategia declarada** y la **operativa real**, devuelve un índice diario (ICO) y, a lo largo del tiempo, extrae patrones de comportamiento (correlación con estado emocional, regla más violada, talón de Aquiles persistente, etc.).

El flujo del usuario es:

1. **Configura su estrategia** — selecciona del catálogo las condiciones de entrada y las reglas conductuales a las que se compromete y fija sus límites operativos (máximo de operaciones, horario).
2. **Declara la intención del día** — estado emocional y notas, sin poder modificar los límites que él mismo se impuso.
3. **Confirma para abrir la sesión** — barrera de reflexión previa; sin confirmación no se puede operar.
4. **Registra los trades por excepción** — todo se asume cumplido por defecto; sólo marca lo que incumplió.
5. **Cierra la sesión** — el sistema calcula el ICO y guarda las violaciones de sesión.
6. **Consulta histórico** — gráfico semanal, calendario mensual, insights agregados.

## Stack

- **Framework**: Next.js 16 (App Router, Turbopack) con React 19.
- **Lenguaje**: TypeScript estricto.
- **Autenticación**: NextAuth.js con provider Credentials + JWT.
- **Base de datos**: SQLite vía Prisma 7 y el adapter `@prisma/adapter-better-sqlite3`.
- **Estilos**: CSS Modules y variables CSS (tokens de diseño en [`src/app/globals.css`](src/app/globals.css)).
- **Gráficos**: Recharts.

## Arquitectura

```
            ┌────────────────────────────────────────┐
            │  Cliente (React 19, App Router)        │
            │  ─ Server Components para fetch SSR    │
            │  ─ Client Components para formularios  │
            └──────────────┬─────────────────────────┘
                           │
                           ▼
            ┌────────────────────────────────────────┐
            │  proxy.ts (middleware)                 │
            │  ─ Protege rutas /(app)/*              │
            │  ─ Lee JWT y redirige a /login         │
            └──────────────┬─────────────────────────┘
                           │
                           ▼
            ┌────────────────────────────────────────┐
            │  API routes (src/app/api/...)          │
            │  ─ /api/auth/*           NextAuth      │
            │  ─ /api/strategy         ABM           │
            │  ─ /api/intention[/confirm]            │
            │  ─ /api/session/{active,close,trade}   │
            │  ─ /api/session/[id]                   │
            │  ─ /api/history[/weekly,/feedback]     │
            └──────────────┬─────────────────────────┘
                           │
                           ▼
            ┌────────────────────────────────────────┐
            │  Prisma 7 + better-sqlite3             │
            │  ─ Singleton en src/lib/prisma.ts      │
            │  ─ Migrations en prisma/migrations/    │
            │  ─ Catálogos seedeados (seed.ts)       │
            └────────────────────────────────────────┘
```

Las páginas se agrupan en dos *route groups*:

- **`(auth)`** — `/login`, `/register`. Públicas. No heredan la navbar.
- **`(app)`** — `/dashboard`, `/strategy`, `/session/*`, `/history`. Protegidas por `proxy.ts`; comparten layout con `Navbar` y `LiquidBackground`.

## Modelo de datos

Definido en [`prisma/schema.prisma`](prisma/schema.prisma). Resumen:

| Modelo | Propósito |
|---|---|
| `User` | Cuenta del trader (email + bcrypt password). |
| `Strategy` | Plan operativo del usuario (1‑a‑1). Define `maxTrades`, `tradingHoursStart/End`. |
| `EntryCondition`, `BehavioralRule` | Catálogos del sistema (datos maestros, gestionados por seed). |
| `StrategyCondition`, `StrategyRule` | Vínculos `Strategy ↔ catálogo` con flag `isActive`. |
| `DailyIntention` | Plan declarado para un día concreto. Único por `(userId, date)`. Snapshot de límites. |
| `Session` | Sesión de trading. Ligada 1‑a‑1 a una `DailyIntention`. Cierra con `icoScore`. |
| `Trade` | Operación dentro de una sesión. Dirección, resultado, P&L, notas. |
| `TradeViolation` | Violación de regla `PER_TRADE` o de condición de entrada en un trade. |
| `SessionViolation` | Violación de regla `PER_SESSION` registrada al cerrar. `@@unique([sessionId, ruleId])`. |

## Cálculo del ICO

Al cerrar la sesión, [`/api/session/close`](src/app/api/session/close/route.ts) calcula:

```
Rs (instancias evaluables) = (Ts × C_activas) + (Ts × R_trade) + R_session
Vs (violaciones totales)   = Σ violaciones por trade + violaciones de sesión
ICO_diario = 1 − (Vs / Rs)             # clampeado a [0, 1]
```

Para el dashboard semanal ([`/api/history/weekly`](src/app/api/history/weekly/route.ts)):

```
M  = media de los ICO diarios de la semana
σ  = desviación estándar poblacional de los ICO diarios
E  = max(0, min(1, 1 − σ / 0.5))       # estabilidad conductual
ICO_semanal = 0.70 × M + 0.30 × E
```

El factor de **estabilidad E** premia la consistencia: un trader con ICO 70 todos los días tiene mejor `ICO_semanal` que otro que alterna 100 y 40 aunque ambos tengan la misma media.

## Requisitos

- **Node.js** 20.x o superior.
- **npm** 10.x (viene con Node 20).
- Windows / macOS / Linux. La compilación nativa de `better-sqlite3` se resuelve en `npm install`.

## Puesta en marcha

```bash
# 1. Clonar e instalar dependencias
git clone https://github.com/santifuenma/kosmos.git
cd kosmos
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Edita .env y rellena NEXTAUTH_SECRET (puedes generarlo con):
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Crear la base de datos y aplicar migraciones
npx prisma migrate deploy

# 4. Poblar los catálogos de condiciones y reglas
npx prisma db seed

# 5. (Opcional) Datos de prueba con sesiones históricas
npm run seed:test

# 6. Arrancar el servidor de desarrollo
npm run dev
```

Por defecto el servidor escucha en `http://localhost:3000`. Si quieres probar desde otro dispositivo en la LAN, actualiza `NEXTAUTH_URL` en `.env` a la IP de tu máquina.

## Scripts disponibles

| Comando | Acción |
|---|---|
| `npm run dev` | Arranca Next.js en modo desarrollo (Turbopack, hot reload). |
| `npm run build` | Build de producción con type-check estricto. |
| `npm run start` | Sirve el build de producción. |
| `npm run lint` | Ejecuta ESLint sobre el proyecto. |
| `npm run seed:test` | Ejecuta `prisma/seed-test-data.ts` para insertar sesiones de demostración. |
| `npx prisma migrate deploy` | Aplica migraciones pendientes a la base de datos. |
| `npx prisma db seed` | Reinicia y siembra los catálogos (`prisma/seed.ts`). |
| `npx prisma studio` | UI web para inspeccionar la base de datos. |

## Variables de entorno

Ver [`.env.example`](.env.example) para la plantilla completa.

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | URL de SQLite. Mantenida por compatibilidad; la ruta real la lee Prisma 7 desde [`prisma.config.ts`](prisma.config.ts). |
| `NEXTAUTH_SECRET` | Clave para firmar los JWT de sesión. Genera 32 bytes aleatorios. |
| `NEXTAUTH_URL` | URL pública desde la que se accede a la app (`http://localhost:3000` en local). |

## Estructura del repositorio

```
prisma/
  migrations/         Histórico SQL de cambios de schema
  schema.prisma       Modelo Prisma
  seed.ts             Carga inicial de catálogos
  seed-test-data.ts   Sesiones de prueba
public/
  images/             Fondos y assets estáticos
src/
  app/
    (auth)/           Login y registro (públicos)
    (app)/            Dashboard, estrategia, sesión, historial (protegidos)
    api/              Endpoints REST
    layout.tsx        Layout raíz con SessionProvider
    page.tsx          Redirección según sesión
    globals.css       Tokens de diseño y reset
  components/
    cards/            IcoCard, MonthlyCalendar, SessionStatsCard, TradesTable
    icons/            Barrel central de iconos SVG
    layout/           Navbar, SessionProvider
    ui/               Tooltip, ConfirmDialog
    LiquidBackground  Fondo animado WebGL
  lib/
    auth.ts           Configuración de NextAuth
    prisma.ts         Singleton del cliente Prisma
    dates.ts          Helpers de fecha (UTC)
    dailyTips.ts      Frases del día
    utils.ts          cn(), capitalize(), countSessionViolations()
  types/
    index.ts          Tipos compartidos
    next-auth.d.ts    Extensión del tipo Session de NextAuth
  proxy.ts            Middleware de autenticación (Next 16)
```
