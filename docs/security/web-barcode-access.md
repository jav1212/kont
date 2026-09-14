# Seguridad y operación del acceso por carnet en la Web

Estado: el código está preparado, pero la funcionalidad no está desplegada ni activada en producción. El alcance funcional y las evidencias locales se mantienen en [Acceso por carnet en la Web](../architecture/web-barcode-access-plan.md).

## Modelo de acceso

Un carnet impreso contiene un código `KONT-…` generado con 128 bits de entropía para Code 128. Es el único factor solicitado: una copia del carnet permite el acceso y debe tratarse como una credencial perdida. La base de datos conserva únicamente el hash del código y un solo carnet activo por titular y tenant.

La terminal es un perfil de navegador enrolado, no una atestación del equipo. Su secreto de 256 bits se conserva en la cookie `kont_barcode_terminal`, que es `HttpOnly`, `SameSite=Strict` y `Secure` en producción. Perder la cookie obliga a enrolar de nuevo; revocar la terminal invalida sus sesiones de carnet.

El servidor crea una sesión Supabase real para el titular y registra su `session_id`, tenant, terminal, carnet, vencimiento y actividad. Los usuarios con MFA verificado, cuentas no confirmadas, eliminadas, suspendidas o de administración de plataforma no son elegibles para recibir ni usar un carnet.

## Administración y ciclo de vida

Sólo un propietario o administrador autenticado de forma convencional y con el permiso `access.manage` puede enrolar terminales, emitir carnets o revocarlos. La página es `/settings/access`; los endpoints administrativos nunca devuelven un código previamente emitido. Reemitir sustituye el carnet activo y revoca las sesiones que dependían de él.

Al emitir un carnet, la vista muestra el titular y las barras Code 128, sin texto del código, instrucciones para el lector ni control para copiarlo. Sólo ofrece **Imprimir** y **Cerrar**; esos controles se excluyen de la impresión y el formato compacto del carnet tiene 110 mm de ancho. Quitar el texto no cambia que el código de barras sea una credencial ni impide que alguien lo copie o escanee: un carnet expuesto debe revocarse como cualquier otra credencial perdida.

Ante pérdida de un carnet, revocarlo desde esa página y emitir uno nuevo. Ante pérdida de una terminal o navegador, revocar la terminal. Ambos casos se registran en `barcode_access_audit` sin almacenar el código, token, cookie ni enlace temporal.

La sesión deja de estar activa después de cinco minutos sin interacción humana registrada o tras ocho horas desde su creación. El botón de bloqueo y el cierre de sesión convencional bloquean el registro servidor. El bloqueo identifica la sesión exacta para que una pestaña antigua no cierre una sesión más nueva; las pestañas se avisan entre sí y vuelven a comprobar el servidor.

### Diagnóstico después de cerrar sesión

Cerrar la sesión del operador o una sesión por carnet no elimina el enrolamiento del navegador ni exige reemitir el carnet. Al volver a la pantalla de carnet, `GET /api/auth/barcode/session` informa el estado de ese enrolamiento sin requerir una sesión Supabase activa. La respuesta esperada para un navegador enrolado contiene `terminal.ready: true`; `active: false` y `registered: false` sólo indican que no hay una sesión por carnet activa.

Si `terminal.ready` es `false`, revisar `terminal.reason`: `not_enrolled` indica que el navegador no envió una credencial de enrolamiento válida o que ya no coincide con una terminal registrada; `revoked` indica que la terminal fue revocada; `access_unavailable` indica que el servidor no pudo comprobar la protección o el registro. Ante `not_enrolled` o `revoked`, según corresponda, debe habilitarse de nuevo el navegador desde **Configuración → Acceso**; ante `access_unavailable`, volver a comprobar el servicio. La respuesta no permite determinar por sí sola por qué una cookie concreta dejó de llegar al servidor; debe comprobarse la cookie `kont_barcode_terminal` en el navegador afectado.

## Protección de datos y compatibilidad

Las tablas `barcode_access_terminals`, `barcode_access_badges`, `barcode_access_sessions` y `barcode_access_audit` pertenecen a `public`, tienen RLS activado y ningún privilegio para `anon` ni `authenticated`. Adaptadores con `service_role` son los únicos que las consultan.

La migración 255 añade una guarda de pre-solicitud de PostgREST y políticas RLS restrictivas a las tablas con RLS de `public`, `storage`, `realtime` y los esquemas `tenant_*`. Si el JWT pertenece a una sesión registrada de carnet, las consultas directas a datos, RPC, Storage y Realtime se rechazan. Las rutas Web revalidan sesión, terminal, carnet, membresía y tenant antes de operar. Logo y avatar se sirven mediante API Web para conservar esa protección.

La función `barcode_access_protection_ready()` impide enrolar terminales si la guarda no está instalada, o si una tabla con RLS nueva no tiene la política restrictiva. Toda migración que agregue una tabla con RLS debe preservar esa política antes de que se active el acceso por carnet.

No hay promesa de funcionamiento sin conexión ni de identificación de hardware. La revocación toma efecto en la siguiente solicitud protegida; no retira datos que ya se hayan enviado al navegador.

## Configuración y despliegue

La función permanece apagada salvo que `KONTAVE_BARCODE_ACCESS_ENABLED=true`. Las rutas de acceso fallan cerradas si la función está apagada o la preparación de base de datos es falsa. En producción, las rutas de carnet exigen `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`; sin ambos, la limitación de intentos niega la solicitud.

Aplicar primero [254_barcode_access_foundation.sql](../../supabase/migrations/254_barcode_access_foundation.sql) y [255_barcode_access_direct_data_guard.sql](../../supabase/migrations/255_barcode_access_direct_data_guard.sql). Desplegar después con la función apagada. Activarla sólo para un piloto tras validar una sesión real de Supabase, revocación, aislamiento, renovación y lector físico. Si hay que revertir, apagar la función y mantener las guardas y tombstones hasta que no pueda sobrevivir ningún JWT emitido por carnet.

## Lectores

Un lector USB tipo teclado se admite desde la pantalla de acceso visible. El Device Manager entrega carnets mediante una concesión exclusiva anunciada como `barcode.access-capture.v1`; un manager antiguo no ofrece esa garantía y debe actualizarse para usar Bridge con carnets. Los valores `KONT-…` no se entregan a los flujos generales de productos ni se retienen en su historial de escaneos.
