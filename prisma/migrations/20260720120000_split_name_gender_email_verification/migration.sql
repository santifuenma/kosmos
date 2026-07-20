-- ─────────────────────────────────────────────────────────────────────────────
-- Separa "name" en "firstName"/"lastName", añade género y verificación de correo.
--
-- Escrita a mano en lugar de generada porque la tabla User ya tiene datos: las
-- columnas nuevas se crean nullable, se rellenan y solo después se marcan NOT
-- NULL. Hacerlo en un paso fallaría con "column contains null values".
-- ─────────────────────────────────────────────────────────────────────────────

-- AlterTable: columnas de nombre, primero nullable para poder rellenarlas
ALTER TABLE "User" ADD COLUMN "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN "lastName" TEXT;

-- Backfill: partimos "name" por el primer espacio.
--   "Santiago Fuenmayor" -> ("Santiago", "Fuenmayor")
--   "Ana Maria Perez"    -> ("Ana", "Maria Perez")   el resto va al apellido
--   "Oswaldo"            -> ("Oswaldo", "")          sin espacio, sin apellido
--   NULL o cadena vacía  -> ("Usuario", "")          firstName no puede quedar vacío
UPDATE "User" SET
  "firstName" = COALESCE(
    NULLIF(split_part(btrim(COALESCE("name", '')), ' ', 1), ''),
    'Usuario'
  ),
  "lastName" = CASE
    WHEN position(' ' IN btrim(COALESCE("name", ''))) > 0
      THEN btrim(substring(btrim("name") FROM position(' ' IN btrim("name")) + 1))
    ELSE ''
  END;

-- Ya sin nulos: aplicamos la restricción y retiramos la columna antigua
ALTER TABLE "User" ALTER COLUMN "firstName" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "lastName" SET NOT NULL;
ALTER TABLE "User" DROP COLUMN "name";

-- AlterTable: género y verificación de correo
ALTER TABLE "User" ADD COLUMN "gender" TEXT NOT NULL DEFAULT 'UNDISCLOSED';
ALTER TABLE "User" ADD COLUMN "emailVerified" TIMESTAMP(3);

-- Las cuentas que ya existían se dan por verificadas. Sin esto quedarían con
-- emailVerified NULL y el login las rechazaría: nadie podría volver a entrar.
UPDATE "User" SET "emailVerified" = CURRENT_TIMESTAMP WHERE "emailVerified" IS NULL;

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE INDEX "VerificationToken_userId_idx" ON "VerificationToken"("userId");

-- AddForeignKey
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
