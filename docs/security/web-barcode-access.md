# Seguridad y operación del acceso por carnet en la Web

Estado: la migración [284](../../supabase/migrations/284_barcode_access_without_terminal_enrollment.sql), que elimina el requisito de enrolamiento para sesiones nuevas, se aplicó correctamente en producción. El modelo funcional y sus rutas están en [Acceso por carnet en la Web](../architecture/web-barcode-access-plan.md). Este registro no acredita un despliegue de código Web ni una autenticación real.

## Modelo de acceso

Un carnet impreso contiene un código `KONT-…` con 128 bits de entropía para Code 128. Es el único factor solicitado: una copia permite acceso y debe tratarse como una credencial perdida. La base conserva el hash para escanear y un único carnet activo por titular y tenant; los carnets nuevos guardan además el mismo valor cifrado con AES-256-GCM v1 exclusivamente para reimpresión.

Después de aplicar 284, cualquier navegador puede iniciar una sesión por carnet sin registrar el navegador. En el primer inicio, el servidor resuelve el tenant y titular exclusivamente desde el carnet; al cambiar de operador, valida el workspace actual comunicado por el navegador antes de compararlo con ese tenant. Luego registra la sesión con `terminal_id = NULL`. Una sesión de carnet no es una sesión única por persona: un mismo carnet puede tener sesiones activas en distintos navegadores. Revocar o reemitir el carnet invalida todas las sesiones activas vinculadas a ese `badge_id`.

El servidor crea una sesión Supabase real y registra `session_id`, tenant, carnet, vencimiento y actividad. Los usuarios con MFA verificado, cuentas no confirmadas, eliminadas, suspendidas o de administración de plataforma no son elegibles para recibir ni usar un carnet. La sesión vence después de cinco minutos sin interacción humana registrada o tras ocho horas desde su creación. Un `GET` de estado no amplía su duración.

## Inicio de sesión y diagnóstico

`GET /api/auth/barcode/session` verifica la disponibilidad global: una respuesta lista contiene `terminal.ready: true` y `terminal.mode: "global"`. El nombre del campo se conserva por compatibilidad de la interfaz; no representa una terminal ni una cookie de navegador. Si la comprobación de protección falla, responde `terminal.ready: false` con `reason: "access_unavailable"`; la pantalla muestra **Acceso temporalmente no disponible**.

En `/sign-in`, una lectura que reconoce un carnet abre **Carnet** aunque esté seleccionada la pestaña **Correo**. Los códigos malformados se rechazan localmente como **Código no válido** y no inician sesión. Una denegación del servidor se muestra como **Acceso no validado**. Mientras el servicio se verifica, sólo la primera lectura válida queda en memoria; la pantalla bloquea solicitudes concurrentes y, tras una confirmación, ignora nuevas lecturas hasta navegar a `/tools?barcode-landing=1`.

Cuando existe una sesión Supabase previa, la ruta sólo permite el intercambio si el workspace autorizado coincide con el tenant del carnet. Una sesión bloqueada o inactiva sólo puede recuperarse con un carnet de su organización registrada. La comparación se completa antes de emitir la sesión nueva: una denegación conserva la sesión previa. Con navegador anónimo permite iniciar la primera sesión. Esta regla evita que una cookie existente se sustituya con un carnet de otro tenant y el cliente no puede imponer el tenant de la credencial.

## Administración y ciclo de vida

La pantalla `/settings/access` contiene sólo carnets. Un propietario o administrador con `access.manage` puede emitir, reemitir, reimprimir, exportar o revocar carnets de miembros confirmados de su tenant. La emisión masiva procesa grupos de hasta 50 usuarios. Reemitir genera otro código e invalida el carnet anterior y todas sus sesiones; reimprimir recupera el mismo código y no las invalida.

Los listados nunca devuelven un código emitido previamente. El código llega sólo mediante la respuesta `no-store` de emisión o reimpresión y se conserva en memoria durante esa operación. La interfaz no muestra su texto: genera barras Code 128 para imprimir o descargar. Un carnet expuesto debe revocarse y reemitirse.

Al emitir o reimprimir, la vista muestra el titular y las barras Code 128 sin texto de la credencial, instrucciones de lector ni control para copiarla. Ofrece **Imprimir**, **Descargar PDF** y **Cerrar**; los controles no se imprimen y el formato compacto tiene 110 mm de ancho. La descarga individual crea un PDF A4 local; la selección crea `carnets-acceso.pdf` con exactamente los `badgeId` marcados en una o más hojas A4, sin el código en texto, metadatos ni nombre de archivo.

El bloqueo identifica la sesión exacta para que una pestaña antigua no bloquee una sesión posterior. Al producirse un nuevo inicio de sesión por carnet, la aplicación elimina las pistas locales del operador anterior y aterriza de nuevo para cargar actor, permisos y workspace desde el servidor; las demás pestañas reciben el cambio y hacen el mismo reinicio. No hay una promesa de acceso sin conexión ni de identificación de hardware.

## Terminales heredadas

`barcode_access_terminals`, la cookie `kont_barcode_terminal` y sus rutas de administración se mantienen sólo por compatibilidad. No se crean ni se solicitan para sesiones nuevas y Configuración ya no las presenta. Si una sesión existente tiene `terminal_id`, conserva sus controles anteriores: terminal activa y preparada, cookie que coincide, revocación de la terminal y sustitución de la sesión activa de esa terminal. Una revocación de terminal afecta esas sesiones heredadas; la revocación de carnet afecta todas las sesiones de ese carnet, con o sin terminal.

## Protección de datos y despliegue

Las tablas `barcode_access_terminals`, `barcode_access_badges`, `barcode_access_sessions` y `barcode_access_audit` pertenecen a `public`, tienen RLS activado y no conceden privilegios a `anon` ni `authenticated`. Sólo adaptadores con `service_role` las consultan.

La migración [255](../../supabase/migrations/255_barcode_access_direct_data_guard.sql) instala una guarda de pre-solicitud y políticas RLS restrictivas. Si el JWT pertenece a una sesión registrada de carnet, las consultas directas a datos, RPC, Storage y Realtime se rechazan. Las rutas Web revalidan sesión, carnet, membresía y tenant antes de operar. Logo y avatar se sirven mediante API Web para conservar esa protección.

`barcode_access_protection_ready()` debe devolver `true` antes de permitir el acceso. Si devuelve `false`, el flujo falla cerrado. La [migración 269](../../supabase/migrations/269_restore_barcode_access_rls_guards.sql) restaura `barcode_web_only` cuando una tabla con RLS creada posteriormente deja la protección incompleta; puede repetirse bajo las condiciones que define la propia migración.

Para recuperar una instalación parcial, ejecutar 269. Recorre las tablas con RLS de `public` y `tenant_*`, y las de `storage` o `realtime` que ya tengan una política permisiva. Añade `barcode_web_only` sólo donde falta, para `authenticated` en tablas de aplicación y `PUBLIC` en tablas de proveedor; no modifica políticas existentes. Tras aplicarla, comprobar `SELECT public.barcode_access_protection_ready();` y esperar `true`. En producción se aplicó el 24 de septiembre de 2026 y esa comprobación devolvió `true`.

Al aplicar 284, la preparación pasó temporalmente a `false` por nueve tablas nuevas sin esa guarda. Se reaplicó 269 en producción como `20260928162045_restore_barcode_access_rls_guards_after_terminal_removal`. La comprobación final confirmó `terminal_id` opcional, `barcode_access_protection_ready() = true` y que la RPC de registro no se puede ejecutar como `anon` ni `authenticated`, sólo como `service_role`.

La reimpresión requiere [262](../../supabase/migrations/262_barcode_badge_reprinting.sql) y `KONTAVE_BARCODE_BADGE_ENCRYPTION_KEY` sólo en el servidor: 43 caracteres base64url que decodifican a 32 bytes. La clave está configurada en Production y debe conservarse: perderla o cambiarla impide reimprimir, aunque no invalida hashes ni escaneos existentes. El valor descifrado no se persiste ni registra en el navegador. La función exige `KONTAVE_BARCODE_ACCESS_ENABLED=true`; en producción, los límites de intentos también exigen `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`.

La migración 284 se aplicó en producción como `20260928161941_barcode_access_without_terminal_enrollment`. Antes de desplegar código que registre sesiones sin terminal, comprobar la preparación RLS, una sesión Supabase real, aislamiento de tenant, dos sesiones simultáneas del mismo carnet en navegadores distintos y revocación de ambas por carnet. No se ha desplegado ese código Web ni se ha documentado una autenticación real o un escaneo físico en caja para este cambio.

## Lectores

Un lector USB tipo teclado se admite desde la pantalla de acceso visible. En modo USB-KBD/HID, **Lector local: connected** confirma la presencia del dispositivo; la lectura llega directamente a la ventana con foco. La Web da prioridad a un carnet válido leído sin alteraciones y puede reconstruir el candidato a partir de las teclas físicas `Key*`, `Digit*` y `Minus` cuando un lector con distribución estadounidense escribe en un navegador con distribución española, incluida la compensación de Mayús y Bloq Mayús. La recuperación no corrige prefijos arbitrarios, bytes ausentes ni un Bloq Mayús incorrecto sin compensación; una entrada física no admitida desactiva la recuperación y un búfer desbordado se descarta al recibir Intro. Se limita a las credenciales: los productos conservan la lectura original y los carnets no se retienen en su historial de escaneos. El Device Manager entrega carnets mediante la concesión exclusiva `barcode.access-capture.v1`.
