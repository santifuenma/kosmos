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

## 2. Variables de entorno en Vercel

En el proyecto de Vercel → **Settings → Environment Variables**, añade (Production
y Preview):

| Variable          | Valor                                                        |
| ----------------- | ------------------------------------------------------------ |
| `DATABASE_URL`    | Cadena del pooler `:6543` con `?pgbouncer=true`              |
| `DIRECT_URL`      | Cadena directa `:5432`                                        |
| `NEXTAUTH_SECRET` | 32 bytes hex (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `NEXTAUTH_URL`    | La URL pública del despliegue, p. ej. `https://kosmos.vercel.app` (sin `/` final) |

> `NEXTAUTH_URL` debe coincidir con el dominio real de Vercel, o el login/logout
> redirigirá a una URL incorrecta.

## 3. Build

No hace falta `vercel.json`: Vercel detecta Next.js automáticamente. El script de
build ya ejecuta `prisma generate` antes de `next build`:

```json
"build": "prisma generate && next build"
```

Las migraciones **no** se aplican en el build; ejecútalas una vez con
`npx prisma migrate deploy` (localmente contra la BD de producción o desde un
paso manual) cuando cambie el esquema.

## 4. Comprobación

Tras el primer despliegue, abre la URL, regístrate y verifica que puedes iniciar
sesión: eso confirma que la conexión al pooler de Supabase funciona en runtime.
