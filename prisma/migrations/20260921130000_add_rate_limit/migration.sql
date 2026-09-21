-- Contadores de intentos para limitar la fuerza bruta en las rutas de cuenta.
--
-- La tabla vive en la propia base de datos y no en memoria del proceso porque
-- en Vercel cada petición puede caer en una instancia distinta: un contador en
-- memoria daría a cada instancia su propio cupo y el límite real sería el
-- configurado multiplicado por el número de instancias vivas.
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- Para que la purga de contadores vencidos no recorra la tabla entera.
CREATE INDEX "RateLimit_windowStart_idx" ON "RateLimit"("windowStart");
