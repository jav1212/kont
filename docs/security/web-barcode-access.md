# Seguridad y operación del acceso por carnet en la Web

Estado: el código está preparado, pero la funcionalidad no está desplegada ni activada en producción. El alcance funcional y las evidencias locales se mantienen en [Acceso por carnet en la Web](../architecture/web-barcode-access-plan.md).

## Modelo de acceso

Un carnet impreso contiene un código `KONT-…` generado con 128 bits de entropía para Code 128. Es el único factor solicitado: una copia del carnet permite el acceso y debe tratarse como una credencial perdida. La base de datos conserva el hash usado para escanear y un solo carnet activo por titular y tenant; los nuevos carnets también guardan, sólo para reimpresión, el mismo valor cifrado con AES-256-GCM v1.

La terminal es un perfil de navegador enrolado, no una atestación del equipo. Su secreto de 256 bits se conserva en la cookie `kont_barcode_terminal`, que es `HttpOnly`, `SameSite=Strict` y `Secure` en producción. Perder la cookie obliga a enrolar de nuevo; revocar la terminal invalida sus sesiones de carnet.

El servidor crea una sesión Supabase real para el titular y registra su `session_id`, tenant, terminal, carnet, vencimiento y actividad. Los usuarios con MFA verificado, cuentas no confirmadas, eliminadas, suspendidas o de administración de plataforma no son elegibles para recibir ni usar un carnet.

La pantalla muestra el progreso de validación. Un código malformado, incluido un escaneo corto, se rechaza de inmediato como **Código no válido** y no envía una solicitud de inicio de sesión; una denegación del servidor se presenta como **Acceso no validado**. Tras confirmar el acceso, muestra en verde **Acceso concedido** y **Abriendo tu espacio de trabajo…**, ignora nuevas lecturas hasta navegar y mantiene visible la confirmación mientras carga la página siguiente.

El inicio confirmado va a `/tools?barcode-landing=1`, que espera un espacio de trabajo autorizado y listo y abre un módulo permitido y disponible —por ejemplo, Ventas en `/sales`— en vez de forzar `/payroll`. Conserva `tid` y `cid`, retira el marcador de un solo uso y usa `/tools` como destino seguro si no hay módulo disponible; las rutas protegidas arbitrarias mantienen sus guardas. Véanse [las pruebas del destino de carnet](../../test/barcode-workspace-landing.test.ts).

## Administración y ciclo de vida

Un propietario o administrador con el permiso canónico `access.manage` puede listar, enrolar o revocar terminales y emitir, reimprimir, reemitir o revocar carnets desde una sesión por carnet o convencional; las guardas de validez de sesión y tenant se mantienen. La página es `/settings/access`; permite seleccionar miembros confirmados del tenant y emitir de 1 a 50 por solicitud, dividiendo selecciones mayores en grupos. La emisión en lote no reemplaza un carnet activo salvo que el solicitante envíe explícitamente `replaceExisting: true`; al reemitir se sustituye el carnet y se revocan sus sesiones dependientes. La lista principal y la exportación sólo muestran carnets activos, aunque el listado de la API conserva metadatos de revocados.

Los endpoints de listado nunca devuelven un código previamente emitido. Un código nuevo llega sólo en la respuesta `no-store` de su emisión y una reimpresión autorizada recupera el mismo código mediante su propia respuesta `no-store`. La pantalla mantiene los valores sólo en memoria durante la operación actual y permite seleccionar mediante casillas hasta 1.000 `badgeId` activos que se exportarán; no los persiste en metadatos de carnet ni puede recuperarlos tras recargar. La interfaz administrativa no muestra el código en texto. **Reimprimir** recupera el mismo código de un carnet activo y no revoca sesiones; **Reemitir** crea otro código, requiere confirmar que el carnet anterior y sus sesiones quedarán invalidados y sigue siendo necesario para un carnet anterior sin cifrado. La interfaz desactiva la reimpresión y la exportación cuando conoce ese caso y la API responde conflicto `409`; no rota el carnet automáticamente.

Al emitir o reimprimir un carnet, la vista muestra el titular y las barras Code 128, sin texto del código, instrucciones para el lector ni control para copiarlo. Ofrece **Imprimir**, **Descargar PDF** y **Cerrar**; los controles se excluyen de la impresión y el formato compacto del carnet tiene 110 mm de ancho. La descarga individual crea localmente un PDF A4 con un carnet de 110 mm y barras vectoriales; la descarga de la selección usa `carnets-acceso.pdf`, contiene exactamente los `badgeId` marcados en una o más hojas A4 y conserva las barras vectoriales sin texto legible de la credencial. No requiere una segunda emisión y no incluye el secreto ni el código de barras en texto, metadatos ni nombre de archivo. Quitar el texto no cambia que el código de barras sea una credencial ni impide que alguien lo copie o escanee: un carnet expuesto debe revocarse como cualquier otra credencial perdida.

Ante pérdida de un carnet, revocarlo desde esa página y emitir uno nuevo. Ante pérdida de una terminal o navegador, revocar la terminal. Ambos casos se registran en `barcode_access_audit` sin almacenar el código, token, cookie ni enlace temporal.

La sesión deja de estar activa después de cinco minutos sin interacción humana registrada o tras ocho horas desde su creación. No hay un control flotante para bloquearla ni para cambiar de usuario; el cierre de sesión convencional bloquea el registro servidor. El bloqueo identifica la sesión exacta para que una pestaña antigua no cierre una sesión más nueva; las pestañas se avisan entre sí y vuelven a comprobar el servidor.

### Diagnóstico después de cerrar sesión

Cerrar la sesión del operador o una sesión por carnet no elimina el enrolamiento del navegador ni exige reemitir el carnet. Al volver a la pantalla de carnet, `GET /api/auth/barcode/session` informa el estado de ese enrolamiento sin requerir una sesión Supabase activa. La respuesta esperada para un navegador enrolado contiene `terminal.ready: true`; `active: false` y `registered: false` sólo indican que no hay una sesión por carnet activa.

Si `terminal.ready` es `false`, revisar `terminal.reason`: `not_enrolled` indica que el navegador no envió una credencial de enrolamiento válida o que ya no coincide con una terminal registrada; `revoked` indica que la terminal fue revocada; `access_unavailable` indica que el servidor no pudo comprobar la protección o el registro. Ante `not_enrolled` o `revoked`, según corresponda, debe habilitarse de nuevo el navegador desde **Configuración → Acceso**; ante `access_unavailable`, volver a comprobar el servicio. La respuesta no permite determinar por sí sola por qué una cookie concreta dejó de llegar al servidor; debe comprobarse la cookie `kont_barcode_terminal` en el navegador afectado.

## Protección de datos y compatibilidad

Las tablas `barcode_access_terminals`, `barcode_access_badges`, `barcode_access_sessions` y `barcode_access_audit` pertenecen a `public`, tienen RLS activado y ningún privilegio para `anon` ni `authenticated`. Adaptadores con `service_role` son los únicos que las consultan.

La migración 255 añade una guarda de pre-solicitud de PostgREST y políticas RLS restrictivas a las tablas con RLS de `public`, `storage`, `realtime` y los esquemas `tenant_*`. Si el JWT pertenece a una sesión registrada de carnet, las consultas directas a datos, RPC, Storage y Realtime se rechazan. Las rutas Web revalidan sesión, terminal, carnet, membresía y tenant antes de operar. Logo y avatar se sirven mediante API Web para conservar esa protección.

La función `barcode_access_protection_ready()` impide enrolar terminales si la guarda no está instalada, o si una tabla con RLS nueva no tiene la política restrictiva. Toda migración que agregue una tabla con RLS debe preservar esa política antes de que se active el acceso por carnet.

No hay promesa de funcionamiento sin conexión ni de identificación de hardware. La revocación toma efecto en la siguiente solicitud protegida; no retira datos que ya se hayan enviado al navegador.

## Configuración y despliegue

La reimpresión requiere [262_barcode_badge_reprinting.sql](../../supabase/migrations/262_barcode_badge_reprinting.sql) y `KONTAVE_BARCODE_BADGE_ENCRYPTION_KEY` sólo en el servidor: 43 caracteres base64url que decodifican a 32 bytes. La clave ya está configurada en Production; debe conservarse porque perderla o cambiarla impide reimprimir, aunque no invalida los hashes ni los escaneos existentes. El valor descifrado no se persiste ni registra en el navegador.

La función permanece apagada salvo que `KONTAVE_BARCODE_ACCESS_ENABLED=true`. Las rutas de acceso fallan cerradas si la función está apagada o la preparación de base de datos es falsa. En producción, las rutas de carnet exigen `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`; sin ambos, la limitación de intentos niega la solicitud. La emisión masiva admite 20 solicitudes por IP y tenant cada minuto, con hasta 50 destinatarios por solicitud; al excederla responde `429` con el tiempo de reintento.

Aplicar primero [254_barcode_access_foundation.sql](../../supabase/migrations/254_barcode_access_foundation.sql) y [255_barcode_access_direct_data_guard.sql](../../supabase/migrations/255_barcode_access_direct_data_guard.sql). Desplegar después con la función apagada. Activarla sólo para un piloto tras validar una sesión real de Supabase, revocación, aislamiento, renovación y lector físico. Si hay que revertir, apagar la función y mantener las guardas y tombstones hasta que no pueda sobrevivir ningún JWT emitido por carnet.

## Lectores

Un lector USB tipo teclado se admite desde la pantalla de acceso visible. En modo USB-KBD/HID, **Lector local: connected** confirma la presencia del dispositivo: el adaptador del Device Manager v0.1.5 no intercepta teclas en ese modo y la lectura llega directamente a la ventana con foco. La Web da prioridad a un carnet válido leído sin alteraciones; si llega alterado por un lector con distribución estadounidense y un navegador con distribución española, la captura de credenciales reconstruye un candidato completo a partir de las teclas físicas `Key*`, `Digit*` y `Minus`, incluida la compensación de Mayús y Bloq Mayús.

La relación entre ese desajuste de distribución y el rechazo comunicado es una causa inferida; la reproducción con puntuación española y la prueba de navegador verifican el código exacto enviado, incluso con el lector compensando Bloq Mayús. Falta validar un escaneo físico. La recuperación no corrige prefijos arbitrarios, bytes ausentes ni un Bloq Mayús incorrecto sin compensación; una entrada física no admitida desactiva la recuperación y un búfer desbordado se descarta al recibir Intro. Véase [las pruebas de compatibilidad del lector](../../test/barcode-keyboard-wedge.test.ts).

La recuperación se limita a la captura de credenciales. Los productos conservan la lectura original; los carnets reconocidos o recuperados no se entregan a esos flujos ni se retienen en su historial de escaneos. El Device Manager entrega carnets mediante una concesión exclusiva anunciada como `barcode.access-capture.v1`; un manager que no la ofrece debe actualizarse para usar Bridge con carnets.
