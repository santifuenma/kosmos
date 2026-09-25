# Despliegue en Vercel + Supabase

Guía para desplegar Kosmos en producción. La base de datos es **PostgreSQL en
Supabase** y el hosting es **Vercel**.

## 1. Base de datos (Supabase)

1. Crea un proyecto en <https://supabase.com> y guarda la contraseña de la BD.
2. En el proyecto: botón **Connect → ORMs → Prisma**. Copia las dos cadenas:
   - `DATABASE_URL` → pooler de transacción, puerto **6543** (runtime de la app).
   - `DIRECT_URL` → sesión / directa, puerto **5432** (migraciones de Prisma).
3. Las migraciones y el catálogo inicial (condiciones + reglas) ya están aplicados
   contra Supabase. Si necesitas recrearlos en una BD nueva:
   ```bash
   npx prisma migrate deploy   # crea las tablas
   npx prisma db seed          # inserta los catálogos del sistema
   ```

## 2. Correo transaccional (Brevo)

Kosmos exige confirmar el correo al registrarse, así que en producción **necesita
poder enviar emails**. Se usa [Brevo](https://www.brevo.com) porque permite
verificar un único remitente (tu propio correo) sin ser dueño de un dominio.

1. Crea una cuenta en Brevo y genera una API key en **SMTP & API → API Keys**
   (empieza por `xkeysib-`).
2. Da de alta el remitente en **Senders, Domains & Dedicated IPs → Senders**.
   Brevo envía un correo de confirmación a esa dirección y **no deja enviar hasta
   que la validas**.
3. Guarda la API key y la dirección del remitente para el paso siguiente.

> Sin `BREVO_API_KEY`, en producción el registro devuelve error (en desarrollo el
> enlace de verificación se imprime en la consola del servidor).

## 3. Variables de entorno en Vercel

En el proyecto de Vercel → **Settings → Environment Variables**, añade (Production
y Preview):

| Variable          | Valor                                                        |
| ----------------- | ------------------------------------------------------------ |
| `DATABASE_URL`    | Cadena del pooler `:6543` con `?pgbouncer=true`              |
| `DIRECT_URL`      | Cadena directa `:5432`                                        |
| `NEXTAUTH_SECRET` | 32 bytes hex (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `NEXTAUTH_URL`    | La URL pública del despliegue, p. ej. `https://kosmos.vercel.app` (sin `/` final) |
| `BREVO_API_KEY`   | API key de Brevo (`xkeysib-…`)                               |
| `BREVO_FROM_EMAIL`| Remitente **verificado** en Brevo                            |
| `BREVO_FROM_NAME` | Opcional. Nombre visible del remitente (por defecto `Kosmos`) |
| `DEMO_DATABASE_URL` | Opcional. Conexión de solo lectura del demo público; ver [§8](#8-demo-público-de-solo-lectura) |

> `NEXTAUTH_URL` debe coincidir con el dominio real de Vercel, o el login/logout
> redirigirá a una URL incorrecta. Además es la base de los **enlaces de
> verificación de correo**: si apunta a otro sitio, los usuarios recibirán enlaces
> que no funcionan.

## 4. Build

Vercel detecta Next.js automáticamente. El único ajuste que lleva el repositorio es
[`vercel.json`](vercel.json), que fija las funciones en la región `fra1`
(Frankfurt) para que estén junto a la base de datos de Supabase y reducir la
latencia de cada consulta:

```json
{ "regions": ["fra1"] }
```

Si tu proyecto de Supabase está en otra región, cambia `fra1` por la más cercana.

El script de build ya ejecuta `prisma generate` antes de `next build`:

```json
"build": "prisma generate && next build"
```

Las migraciones **no** se aplican en el build; ejecútalas una vez con
`npx prisma migrate deploy` (localmente contra la BD de producción o desde un
paso manual) cuando cambie el esquema. Ver la sección
[«Tras cambiar el esquema»](#6-tras-cambiar-el-esquema-o-los-datos-maestros).

## 5. Comprobación

Tras el primer despliegue, abre la URL y comprueba el flujo completo:

1. **Regístrate** con un correo real. Debe llegarte el correo de confirmación
   (revisa spam la primera vez). Si no llega, mira `BREVO_API_KEY`,
   `BREVO_FROM_EMAIL` y que el remitente esté verificado en Brevo.
2. **Pulsa el enlace** y comprueba que apunta al dominio de Vercel, no a
   `localhost`. Si apunta mal, revisa `NEXTAUTH_URL`.
3. **Inicia sesión** y completa el onboarding. Esto confirma que la conexión al
   pooler de Supabase funciona en runtime.

## 6. Tras cambiar el esquema o los datos maestros

Como las migraciones no se aplican solas, es fácil desplegar código nuevo con la
base de datos por detrás. Después de fusionar a `master` un cambio que incluya
una carpeta nueva en `prisma/migrations/`:

```bash
npx prisma migrate status   # ¿hay migraciones sin aplicar?
npx prisma migrate deploy   # aplícalas a producción
```

`migrate status` es de solo lectura, así que puedes lanzarlo siempre que dudes.
Conviene leer el `migration.sql` antes de aplicarla: algunas migraciones de este
proyecto son solo de datos (por ejemplo, desactivar reglas obsoletas) y no
cambian la estructura.

## 7. Mantener el proyecto activo (Supabase Free)

El plan gratuito de Supabase **pausa los proyectos tras una semana sin actividad
de base de datos**. Para evitarlo, un repositorio privado aparte,
`db-keepalive`, ejecuta cada día (06:17 UTC) una escritura mínima en una tabla
propia (`keepalive.heartbeat`, esquema `keepalive`) que no interfiere con las
tablas de Kosmos ni con las migraciones de Prisma.

- Kosmos entra por el secret `DB_URL_KOSMOS` de ese repositorio (la misma
  `DATABASE_URL` del pooler que usa la aplicación). **Si cambias la contraseña de
  la base de datos, actualiza también ese secret**:
  `gh secret set DB_URL_KOSMOS --repo santifuenma/db-keepalive`
- Comprobar que sigue funcionando:
  `gh run list --repo santifuenma/db-keepalive --workflow "Keep-alive"`.
  Si una ejecución falla, GitHub envía un correo.
- Si el proyecto llegara a pausarse, el keep-alive no puede reanimarlo: hay que
  restaurarlo desde el panel de Supabase (se conservan los datos).
- Para ver el último latido: `SELECT * FROM keepalive.heartbeat;`

## 8. Demo público de solo lectura

`/api/demo-login` abre una sesión con la cuenta `usuarioprueba@gmail.com` (la
que siembra `prisma/seed-testuser.ts`) y lleva al dashboard. Es el destino del
botón «Ver demo» del portfolio: `https://<tu-dominio>/api/demo-login`.

El visitante puede recorrer el flujo entero de una sesión (plan del día,
confirmar, registrar operaciones, cerrar y ver el ICO). Nada de eso llega a la
base de datos: se guarda cifrado en una cookie de su navegador
([`demoSandbox.ts`](src/lib/demoSandbox.ts)), dura hasta que cierra el
navegador y se borra cada vez que entra por `/api/demo-login` o pulsa
«Empezar de cero» en el banner. Las rutas de ese flujo llaman a
[`demoActions.ts`](src/lib/demoActions.ts) cuando la sesión es la del demo.

### Qué impide que el demo escriba

| Capa | Dónde | Qué hace |
| --- | --- | --- |
| Postgres | Rol `kosmos_demo` (migración `demo_read_only_role`) | Solo tiene `SELECT`, sus policies RLS solo le enseñan las filas del demo y sus transacciones son de solo lectura. No puede leer `password` ni las tablas de tokens o límites. |
| Aplicación | `dbFor()` en `src/lib/prisma.ts` | Toda consulta hecha en nombre del demo va por la conexión `DEMO_DATABASE_URL`, es decir, con ese rol. Si falta la variable, falla en vez de usar la conexión completa. |
| Proxy | `src/proxy.ts` | Responde 403 a cualquier `POST`/`PUT`/`PATCH`/`DELETE` del demo contra la API, salvo los cuatro `POST` del flujo de sesión, que se simulan en la cookie. |
| Interfaz | Layout y estrategia | Banner que avisa de que nada se guarda; la estrategia queda bloqueada. Solo cosmético. |

La API REST de Supabase (la que se usa con la clave `anon`) queda cerrada aparte:
la misma migración retira a `anon` y `authenticated` todos los permisos sobre
las tablas de `public`, y RLS sigue activado sin policies para ellos.

### Puesta en marcha

1. Aplica la migración: `npx prisma migrate deploy`. Crea el rol **sin**
   permiso para conectarse.
2. Dale contraseña, desde el SQL Editor de Supabase o `psql` con `DIRECT_URL`
   (genera una con `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`):
   ```sql
   ALTER ROLE kosmos_demo WITH LOGIN PASSWORD '<contraseña>';
   ```
3. Construye `DEMO_DATABASE_URL` copiando `DATABASE_URL` y cambiando solo el
   usuario (`postgres.<ref>` → `kosmos_demo.<ref>`) y la contraseña. Añádela a
   `.env` y a Vercel (Production y Preview) y vuelve a desplegar.

Sin `DEMO_DATABASE_URL`, `/api/demo-login` responde 503 y el resto de la app
funciona igual.

### Comprobar que no puede escribir

```bash
node scripts/check-demo-readonly.mjs
```

Se conecta como `kosmos_demo` e intenta insertar, borrar, quitarse el modo de
solo lectura, darse permisos o leer datos de otros. Todo debe salir `OK`. Cada
intento se deshace al terminar, así que es seguro lanzarlo contra producción.
