-- Rol de solo lectura para el demo público.
--
-- La app entra en la base de datos como `postgres`, que se salta RLS
-- (bypassrls). Por eso escribir policies "para el usuario demo" no bloquearía
-- nada si las consultas del demo siguieran yendo por esa conexión. Lo que hace
-- esta migración es crear un rol aparte, `kosmos_demo`, y la app usa una
-- conexión propia con ese rol para todo lo que pide una sesión de demo. Así,
-- aunque una ruta de la API tuviera un fallo e intentara escribir, quien dice
-- que no es Postgres.
--
-- El rol se crea sin permiso para iniciar sesión (NOLOGIN). La contraseña no
-- puede ir en un fichero que está en git, así que se activa aparte con:
--   ALTER ROLE kosmos_demo WITH LOGIN PASSWORD '...';
-- (ver DEPLOY.md). Hasta entonces nadie puede conectarse con él.

-- ── 1. El rol ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kosmos_demo') THEN
    CREATE ROLE kosmos_demo NOLOGIN;
  END IF;
END
$$;

-- Tercera capa, por si las otras dos fallaran algún día: toda transacción que
-- abra este rol es de solo lectura. Un INSERT recibe "cannot execute INSERT in
-- a read-only transaction" antes incluso de mirar los permisos.
ALTER ROLE kosmos_demo SET default_transaction_read_only = on;
-- Una consulta del demo no debería tardar ni un segundo. Si alguien consigue
-- lanzar algo pesado, se corta a los 5 s en vez de ocupar la base de datos.
ALTER ROLE kosmos_demo SET statement_timeout = '5s';

-- ── 2. Qué usuario es el demo ───────────────────────────────────────────────
-- Las policies necesitan el id del usuario demo. No lo escribimos a mano
-- porque cambia de una base de datos a otra; lo buscamos por su correo.
--
-- SECURITY DEFINER: la función se ejecuta con los permisos de su dueño
-- (postgres), no con los de quien la llama. Así kosmos_demo puede saber el id
-- del demo sin tener acceso a la tabla User entera. Solo devuelve ese id.
-- `search_path = ''` evita que alguien cuele una tabla "User" falsa en otro
-- esquema para engañarla.
CREATE OR REPLACE FUNCTION public.kosmos_demo_user_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM public."User" WHERE email = 'usuarioprueba@gmail.com'
$$;

REVOKE ALL ON FUNCTION public.kosmos_demo_user_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kosmos_demo_user_id() TO kosmos_demo;

-- ── 3. Permisos: solo SELECT, y solo en lo que el demo necesita ─────────────
-- No hay ningún GRANT de INSERT, UPDATE ni DELETE. Sin él, Postgres rechaza la
-- escritura con "permission denied" antes de llegar a mirar las policies.
GRANT USAGE ON SCHEMA public TO kosmos_demo;
GRANT SELECT ON
  "Strategy",
  "StrategyCondition",
  "StrategyRule",
  "EntryCondition",
  "BehavioralRule",
  "DailyIntention",
  "Session",
  "Trade",
  "TradeViolation",
  "SessionViolation"
TO kosmos_demo;

-- De User solo las columnas que se muestran. La columna `password` (el hash)
-- queda fuera: pedirla da "permission denied" aunque la fila sea la del demo.
GRANT SELECT (id, email, "firstName", "lastName", gender, "emailVerified") ON "User" TO kosmos_demo;

-- Sin ningún permiso: VerificationToken, RateLimit y _prisma_migrations.

-- ── 4. Policies: qué filas ve ───────────────────────────────────────────────
-- RLS ya está activado en todas las tablas de public. Una tabla con RLS y sin
-- policy para un rol no le devuelve ninguna fila a ese rol. Cada policy de
-- abajo abre una sola cosa: SELECT, para kosmos_demo, sobre las filas del
-- usuario demo. Las filas de los demás usuarios siguen invisibles.
--
-- Los DROP ... IF EXISTS permiten volver a lanzar el fichero sin errores.

DROP POLICY IF EXISTS kosmos_demo_select ON "User";
CREATE POLICY kosmos_demo_select ON "User"
  FOR SELECT TO kosmos_demo
  USING (id = public.kosmos_demo_user_id());

DROP POLICY IF EXISTS kosmos_demo_select ON "Strategy";
CREATE POLICY kosmos_demo_select ON "Strategy"
  FOR SELECT TO kosmos_demo
  USING ("userId" = public.kosmos_demo_user_id());

DROP POLICY IF EXISTS kosmos_demo_select ON "DailyIntention";
CREATE POLICY kosmos_demo_select ON "DailyIntention"
  FOR SELECT TO kosmos_demo
  USING ("userId" = public.kosmos_demo_user_id());

DROP POLICY IF EXISTS kosmos_demo_select ON "Session";
CREATE POLICY kosmos_demo_select ON "Session"
  FOR SELECT TO kosmos_demo
  USING ("userId" = public.kosmos_demo_user_id());

-- Catálogo: lo del sistema (userId nulo) es de todos; lo personalizado, solo
-- si es del demo.
DROP POLICY IF EXISTS kosmos_demo_select ON "EntryCondition";
CREATE POLICY kosmos_demo_select ON "EntryCondition"
  FOR SELECT TO kosmos_demo
  USING ("userId" IS NULL OR "userId" = public.kosmos_demo_user_id());

DROP POLICY IF EXISTS kosmos_demo_select ON "BehavioralRule";
CREATE POLICY kosmos_demo_select ON "BehavioralRule"
  FOR SELECT TO kosmos_demo
  USING ("userId" IS NULL OR "userId" = public.kosmos_demo_user_id());

-- Las tablas que no tienen userId llegan al usuario a través de su padre. Las
-- subconsultas pasan a su vez por la policy del padre, así que no pueden
-- encontrar filas de nadie más.
DROP POLICY IF EXISTS kosmos_demo_select ON "StrategyCondition";
CREATE POLICY kosmos_demo_select ON "StrategyCondition"
  FOR SELECT TO kosmos_demo
  USING (EXISTS (
    SELECT 1 FROM "Strategy" s
    WHERE s.id = "StrategyCondition"."strategyId"
      AND s."userId" = public.kosmos_demo_user_id()
  ));

DROP POLICY IF EXISTS kosmos_demo_select ON "StrategyRule";
CREATE POLICY kosmos_demo_select ON "StrategyRule"
  FOR SELECT TO kosmos_demo
  USING (EXISTS (
    SELECT 1 FROM "Strategy" s
    WHERE s.id = "StrategyRule"."strategyId"
      AND s."userId" = public.kosmos_demo_user_id()
  ));

DROP POLICY IF EXISTS kosmos_demo_select ON "Trade";
CREATE POLICY kosmos_demo_select ON "Trade"
  FOR SELECT TO kosmos_demo
  USING (EXISTS (
    SELECT 1 FROM "Session" s
    WHERE s.id = "Trade"."sessionId"
      AND s."userId" = public.kosmos_demo_user_id()
  ));

DROP POLICY IF EXISTS kosmos_demo_select ON "SessionViolation";
CREATE POLICY kosmos_demo_select ON "SessionViolation"
  FOR SELECT TO kosmos_demo
  USING (EXISTS (
    SELECT 1 FROM "Session" s
    WHERE s.id = "SessionViolation"."sessionId"
      AND s."userId" = public.kosmos_demo_user_id()
  ));

DROP POLICY IF EXISTS kosmos_demo_select ON "TradeViolation";
CREATE POLICY kosmos_demo_select ON "TradeViolation"
  FOR SELECT TO kosmos_demo
  USING (EXISTS (
    SELECT 1 FROM "Trade" t
    JOIN "Session" s ON s.id = t."sessionId"
    WHERE t.id = "TradeViolation"."tradeId"
      AND s."userId" = public.kosmos_demo_user_id()
  ));

-- ── 5. Cerrar la API REST de Supabase ───────────────────────────────────────
-- `anon` y `authenticated` son los roles que usa la API REST de Supabase
-- (PostgREST) con la clave pública. Kosmos no usa esa API, pero Supabase les
-- da por defecto todos los permisos sobre cada tabla nueva. Hoy RLS sin
-- policies ya les impide ver o tocar ninguna fila; quitarles los permisos
-- hace que eso no dependa solo de que RLS siga activado.
--
-- `service_role` no se toca: es la clave de administración, se salta RLS
-- igual que postgres y no sale nunca del panel de Supabase.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- Y que no vuelvan a recibirlos en las tablas que creen futuras migraciones.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
