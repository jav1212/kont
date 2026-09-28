# Acceso por carnet en la Web

Estado: la migración [284](../../supabase/migrations/284_barcode_access_without_terminal_enrollment.sql) se aplicó correctamente en producción. La restauración posterior de las guardas RLS y su evidencia operativa se documentan en [Seguridad y operación del acceso por carnet](../security/web-barcode-access.md). No se ha desplegado código Web ni se ha realizado una prueba real de autenticación para este cambio.

## Alcance

Un usuario de la Web inicia sesión al escanear un carnet, sin PIN ni registro previo del navegador. Dentro de un workspace autenticado, una lectura también puede cambiar el operador sin pedir una recarga manual: la aplicación reconstruye el contexto con el actor y los permisos del carnet. El carnet es una credencial reutilizable y copiable por decisión de producto; no demuestra presencia física ni identidad de hardware. El alcance es únicamente Web: no incluye Desktop, Mobile, asistencia laboral ni control de acceso físico.

El inicio convencional se conserva para recuperación. El lector valida la disponibilidad global del servicio y cualquier navegador puede intercambiar un carnet válido. No hay enrolamiento automático ni requisito de cookie de terminal. En el primer inicio el tenant se deriva del carnet; al cambiar de operador, el navegador puede comunicar su workspace actual como pista, pero el servidor lo autoriza antes de compararlo con el tenant resuelto del carnet.

## Comportamiento tras aplicar 284

- En `/sign-in`, una lectura válida abre **Carnet** incluso si está seleccionada la pestaña **Correo**. La coordinación entre ambos métodos evita autenticaciones concurrentes. Mientras se comprueba la disponibilidad general, la interfaz conserva en memoria sólo la primera lectura válida.
- `POST /api/auth/barcode` busca el hash del carnet activo y obtiene en el servidor su titular y tenant. Si el navegador ya presenta una sesión, sólo permite el intercambio cuando su workspace autorizado coincide con la organización del carnet; una sesión bloqueada o inactiva sólo puede recuperarse con un carnet de esa misma organización. La verificación ocurre antes de emitir la nueva sesión, por lo que un carnet rechazado preserva la cookie y la sesión válidas del operador anterior. Un navegador anónimo puede iniciar su primera sesión por carnet.
- Dentro del workspace, el listener de acceso reserva únicamente un valor completo `KONT-…`; los escaneos de productos conservan su ruta de POS. Tras un intercambio válido, se eliminan las pistas locales de tenant, empresa, módulo, barra lateral y actor; después se navega al destino de aterrizaje y se vuelve a construir el workspace desde la autorización de servidor del nuevo actor. Esto evita conservar permisos o contexto del operador anterior incluso cuando ambos pertenecen a la misma organización. Las demás pestañas reciben el reemplazo de sesión, descartan las mismas pistas y se reinician en ese destino.
- El servidor crea una sesión Supabase real y registra su `session_id`, tenant, carnet, vencimiento y actividad. Las sesiones nuevas dejan `terminal_id` en `NULL`; por tanto, un mismo carnet puede mantener sesiones activas en navegadores distintos.
- La sesión vence tras cinco minutos sin actividad humana real o tras ocho horas desde su creación. El middleware y las rutas con tenant vuelven a validarla y fijan el tenant registrado, aun si llegan cabeceras o parámetros distintos.
- Revocar o reemitir un carnet invalida todas sus sesiones activas, incluidas las abiertas desde navegadores distintos. Reimprimir conserva el mismo carnet y no invalida sesiones.
- `/settings/access` muestra solamente la administración de carnets: emitir, reemitir, reimprimir, exportar y revocar. El permiso canónico sigue siendo `access.manage`.
- Los códigos con prefijo `KONT-` se separan de la captura de productos. El Device Bridge puede entregarlos sólo a una pantalla de acceso que tenga la concesión exclusiva `barcode.access-capture.v1`.

Cada carnet usa un valor `KONT-…` compatible con Code 128 y 128 bits de entropía. Se guarda su hash para validación y, en carnets nuevos, el valor cifrado AES-256-GCM v1 sólo en el servidor para reimpresión. El valor completo se devuelve únicamente al emitir o reimprimir, mediante una respuesta `no-store`, y la pantalla lo mantiene sólo en memoria para la exportación actual.

## Compatibilidad de terminales heredadas

Las tablas y rutas de terminales existentes se conservan para compatibilidad. No forman parte de la interfaz de configuración ni se usan para inicios nuevos. Una sesión heredada que tenga `terminal_id` mantiene sus guardas: validación de terminal, revocación de terminal y reemplazo de la sesión activa de esa terminal. La migración 284 no borra terminales, cookies ni sesiones existentes.

## Contrato Web

| Ruta | Uso |
| --- | --- |
| `GET`/`POST /api/access/badges` | Listar o emitir/reemplazar un carnet; la emisión devuelve el código sólo esa vez. |
| `POST /api/access/badges/batch` | Emitir carnets para entre 1 y 50 usuarios distintos del tenant. `replaceExisting` sólo reemplaza activos cuando es `true`. |
| `POST /api/access/badges/:id/revoke` | Revocar el carnet y todas sus sesiones activas. |
| `POST /api/access/badges/:id/print` | Reimprimir un carnet activo cifrado; conserva sus sesiones. |
| `POST /api/access/badges/print` | Preparar entre 1 y 1.000 carnets activos seleccionados para PDF. |
| `POST /api/auth/barcode` | Intercambiar un carnet válido por una sesión registrada, sin requisito de terminal. |
| `GET`/`POST /api/auth/barcode/session` | Consultar disponibilidad global y sesión, o registrar actividad humana. La consulta no amplía la sesión. |
| `POST /api/auth/barcode/lock` | Bloquear la sesión registrada mostrada por esa pestaña. |

`GET`/`POST /api/access/terminals` y `POST /api/access/terminals/:id/revoke` permanecen como API heredada de compatibilidad; no deben añadirse a nuevos clientes.

Los errores de validación son deliberadamente genéricos y las mutaciones requieren mismo origen. En producción, los límites de intentos fallan cerrados si faltan las credenciales de Upstash Redis. Las respuestas que contienen un código son `no-store`, están limitadas por tasa y se auditan sin guardar la credencial en registros o persistencia del navegador.

## Datos y migración

Las migraciones [254](../../supabase/migrations/254_barcode_access_foundation.sql), [255](../../supabase/migrations/255_barcode_access_direct_data_guard.sql), [262](../../supabase/migrations/262_barcode_badge_reprinting.sql) y [269](../../supabase/migrations/269_restore_barcode_access_rls_guards.sql) siguen siendo requisitos del acceso por carnet. La 255 impide que un JWT de sesión por carnet acceda directamente a PostgREST/RPC, Storage o Realtime; esos recursos pasan por rutas Web protegidas.

La migración 269 recupera la preparación de acceso cuando una migración posterior a 255 crea una tabla con RLS sin la política restrictiva `barcode_web_only`. Recorre las tablas con RLS de `public` y `tenant_*`, además de las tablas permisivas de `storage` y `realtime`; añade la guarda sólo donde falta y se detiene ante una política homónima incompatible. En producción se aplicó el 24 de septiembre de 2026 y `barcode_access_protection_ready()` devolvió `true`. La reparación no rota terminales, carnets ni sesiones heredadas.

La [migración 284](../../supabase/migrations/284_barcode_access_without_terminal_enrollment.sql) permite `terminal_id` nulo en `barcode_access_sessions` y actualiza `barcode_access_register_session`. Cuando recibe un terminal no nulo preserva las comprobaciones y el reemplazo de sesión heredados; cuando recibe `NULL`, valida carnet, tenant, membresía y sesión del proveedor sin serializar sesiones por navegador. Se aplicó en producción como `20260928161941_barcode_access_without_terminal_enrollment`.

Para revertir el cambio de aplicación, detener nuevos intercambios por carnet mediante el interruptor de función y conservar las migraciones, guardas y tombstones. No se debe restaurar una versión que exija una terminal para una sesión ya registrada con `terminal_id` nulo.

## Validación pendiente

Antes de habilitar el flujo Web en producción, validar una sesión por el mismo carnet en dos navegadores, confirmar que ambos registros tienen `terminal_id = NULL`, revocar el carnet y comprobar que ambas sesiones quedan invalidadas. Validar además el cambio de operador dentro de una misma organización, incluidos permisos distintos, el rechazo de un carnet de otra organización sin perder la sesión previa y la recuperación de una sesión bloqueada con un carnet de la misma organización. También falta validar una lectura física USB/HID en caja.

La validación enfocada de esta corrección aprobó `pnpm test:barcode` (63/63) y `pnpm test:barcode:workspace` (12/12); el primero cubre el registro con `p_terminal_id` explícitamente nulo. Las pruebas Chromium simuladas [barcode-pos-browser.test.mjs](../../test/barcode-pos-browser.test.mjs) y [barcode-workspace-switcher-browser.test.mjs](../../test/barcode-workspace-switcher-browser.test.mjs) aprobaron (2/2), junto con el ESLint focalizado y `tsc --noEmit` en la raíz. Esta evidencia no acredita un despliegue de código Web, autenticación real ni lectura física.
