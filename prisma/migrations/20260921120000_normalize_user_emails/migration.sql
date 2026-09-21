-- Normaliza las direcciones de correo ya almacenadas.
--
-- A partir de ahora la aplicación guarda y busca siempre la dirección en
-- minúsculas (ver src/lib/emailAddress.ts). Las filas creadas antes de ese
-- cambio conservan la caja con la que se escribieron, así que sin este UPDATE
-- quien se registró como "Santi@Gmail.com" dejaría de encontrar su cuenta al
-- iniciar sesión: la búsqueda normalizada no casaría con el valor guardado.
--
-- Si dos cuentas distintas solo se diferencian en mayúsculas, este UPDATE
-- falla contra el índice único de email y la migración se detiene. Es el
-- comportamiento deseado: son dos cuentas para el mismo buzón y hay que
-- decidir a mano cuál se conserva antes de continuar.
UPDATE "User"
SET email = LOWER(TRIM(email))
WHERE email <> LOWER(TRIM(email));
