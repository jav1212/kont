# Acceso por carnet en la Web

Fecha: 2026-09-10. Estado: implementación preparada en el repositorio; no desplegada ni activada en producción.

## Alcance acordado

Un usuario de la Web inicia sesión al escanear un carnet, sin PIN. El carnet es una credencial reutilizable y copiable por decisión de producto; no demuestra presencia física ni identidad de hardware. El primer alcance es únicamente la Web: no incluye Desktop, Mobile, asistencia laboral ni control de acceso físico.

Se conserva el inicio de sesión convencional para recuperación. El detalle de seguridad, operación y activación está en [Acceso por carnet en la Web](../security/web-barcode-access.md).

## Implementado en el código pendiente de despliegue

- Un perfil de navegador se enrola como terminal para un tenant. Su secreto aleatorio se guarda sólo en una cookie `HttpOnly`, `Secure` en producción y `SameSite=Strict`; la terminal no equivale a una prueba de hardware.
- Un propietario o administrador con el permiso canónico `access.manage` puede gestionar terminales y carnets en `/settings/access` desde una sesión por carnet o convencional; las guardas de validez de sesión y tenant se mantienen.
- Cada carnet usa un valor `KONT-…` compatible con Code 128 y 128 bits de entropía. El hash conserva la validación de escaneo; los nuevos carnets guardan además el valor cifrado AES-256-GCM v1, exclusivamente del lado servidor, para reimprimir el mismo carnet activo. Reemitir o revocar el carnet revoca sus sesiones; reimprimir no.
- `POST /api/auth/barcode` valida terminal y carnet y genera una sesión Supabase real para el titular. El servidor la registra con su tenant, terminal y carnet; no acepta un usuario elegido por el navegador.
- La sesión de carnet vence tras cinco minutos sin actividad real o al cabo de ocho horas. El middleware y las rutas con tenant vuelven a validarla y fijan su tenant, aun si llegan cabeceras o parámetros distintos.
- El bloqueo revoca la sesión exacta en el servidor. Una notificación entre pestañas recarga las vistas antiguas cuando otra sesión reemplaza la suya; la respuesta tardía de bloqueo no borra las cookies de un nuevo inicio de sesión.
- Los códigos con prefijo `KONT-` se separan de la captura de productos. El Device Bridge actualizado puede entregar un carnet sólo a una pantalla de acceso que posee una concesión exclusiva.

Las migraciones [254](../../supabase/migrations/254_barcode_access_foundation.sql) y [255](../../supabase/migrations/255_barcode_access_direct_data_guard.sql) son parte inseparable de esta entrega. La segunda impide que el JWT de una sesión de carnet acceda directamente a PostgREST/RPC, Storage o Realtime; esos recursos deben pasar por las rutas Web protegidas. Las rutas de imágenes actúan como proxy para logo y avatar.

La migración [262](../../supabase/migrations/262_barcode_badge_reprinting.sql) añade el cifrado de reimpresión a la tabla existente y una RPC de emisión de cinco argumentos, exclusiva de `service_role`; mantiene compatible la variante anterior de cuatro argumentos. Los carnets anteriores necesitan una reemisión explícita para habilitar la reimpresión.

## Contrato Web

| Ruta | Uso |
| --- | --- |
| `GET`/`POST /api/access/terminals` | Listar o enrolar la terminal del navegador con una sesión de tenant autorizada. |
| `POST /api/access/terminals/:id/revoke` | Revocar una terminal y sus sesiones de carnet. |
| `GET`/`POST /api/access/badges` | Listar o emitir/reemplazar un carnet; la respuesta de emisión contiene el código sólo esa vez. |
| `POST /api/access/badges/:id/revoke` | Revocar un carnet y sus sesiones. |
| `POST /api/access/badges/:id/print` | Reimprimir un carnet activo con cifrado; conserva sus sesiones. |
| `POST /api/access/badges/print` | Preparar todos los carnets activos para PDF; falla sin resultado parcial si alguno no puede reimprimirse. |
| `POST /api/auth/barcode` | Intercambiar un escaneo válido por una sesión registrada. |
| `GET`/`POST /api/auth/barcode/session` | Consultar el estado o registrar actividad humana; la consulta no amplía la sesión. |
| `POST /api/auth/barcode/lock` | Bloquear la sesión registrada mostrada por esa pestaña. |

Los errores de validación de carnet son deliberadamente genéricos y las rutas de mutación requieren mismo origen. Las respuestas de reimpresión son `no-store`, están limitadas por tasa y se auditan; no exponen el código a persistencia o registros del navegador. En producción, la limitación de intentos falla cerrada si no están configurados Upstash Redis REST URL y token.

## Activación pendiente

1. Aplicar las migraciones 254 y 255 en el orden indicado y comprobar que `barcode_access_protection_ready()` devuelve verdadero.
2. Desplegar el código con `KONTAVE_BARCODE_ACCESS_ENABLED` distinto de `true`. En ese estado no se enrolan terminales ni se permiten inicios por carnet.
3. Configurar `KONTAVE_BARCODE_ACCESS_ENABLED=true` y las credenciales de Upstash sólo para el piloto. En producción Upstash es obligatorio.
4. Validar con una cuenta de prueba real de Supabase el ciclo completo de emisión, escaneo, renovación, bloqueo, revocación y el aislamiento de datos; también probar un lector USB tipo teclado y, si se usa, un Device Manager que anuncie `barcode.access-capture.v1`.
5. Empezar con un tenant y una terminal. Mantener el interruptor en falso si falla cualquiera de esas comprobaciones.

Para revertir, desactivar el interruptor para impedir nuevos inicios y conservar las migraciones, las comprobaciones y los tombstones de sesión. No se debe volver a una versión que devuelva un JWT de carnet sin las guardas de la migración 255 mientras pueda existir uno de esos JWT.

## Evidencia actual

- Las cinco pruebas del PDF de carnets cubren la tarjeta individual, tres tarjetas normales por página y los nombres largos. [test-barcode-reprinting-sql.mjs](../../scripts/test-barcode-reprinting-sql.mjs) ejecuta las migraciones 254, 255 y 262 contra una base efímera para comprobar la compatibilidad del RPC, el cifrado, las políticas y la auditoría; pasaron nueve pruebas de servicio y operación para reimpresión activa sin RPC, revocación y tenant cruzado, legado `409`, clave ausente sin rotación y AES con alteración o AAD inválido.

- `pnpm build` finalizó correctamente.
- `pnpm test:barcode` pasó con 23 pruebas Node enfocadas en las reglas de acceso, sesión, carnet y Bridge.
- `pnpm test:barcode:sql` pasó contra PGlite desechable y ejecutó las migraciones reales: reemplazo de carnet, aislamiento de tenant, reemplazo de sesión de terminal, denegación directa de RLS/RPC/Storage y lectura de preparación. PGlite está fijado como módulo temporal externo, no como dependencia declarada del proyecto; el script documenta `PGLITE_MODULE_PATH`.
- `pnpm test:barcode:web` pasó con Chromium sin interfaz y respuestas simuladas: comprueba el contrato de la interfaz, no una sesión real del proveedor.
- El lint global informa 18 errores y 340 advertencias en archivos no tocados; las auditorías `audit:routes` y `audit:shared` no tienen una línea base disponible para atribuirles un resultado en esta entrega.

No se han aplicado migraciones ni se ha desplegado o activado la función. La integración real con Supabase y la lectura física siguen pendientes.
