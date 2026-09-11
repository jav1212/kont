# Organizaciones en la Web

La Web incorpora una vista explícita de organización sobre el dominio existente
de `@kontave/organizations`. Es una integración inicial de presentación y
administración de identidad; las operaciones históricas conservan su contexto
de tenant. Este documento describe el código y el estado operativo conocido;
no acredita un despliegue de los cambios Web o API.

## Experiencia y alcance

El selector de organización aparece en la barra lateral incluso cuando hay un
solo espacio disponible. La empresa seleccionada y la cuenta personal siguen
siendo conceptos distintos. Configuración agrupa sus entradas en Organización,
Empresa y Cuenta personal.

`/settings/organization` muestra nombre, logo y rol del usuario. Sus secciones
de empresas, miembros e invitaciones y roles consultan las proyecciones de la
organización según los permisos efectivos del usuario. Los errores de consulta
tienen reintento y no se representan como listas vacías o conteos de cero.

Quien tenga `organizations.update` puede cambiar el nombre, subir un logo o
quitarlo. Cada escritura incluye `expectedVersion`; los conflictos de versión
se devuelven como HTTP 409. Los logos admiten PNG, JPEG y WebP, hasta 5.000.000
bytes, y se guardan al seleccionar el archivo.

El enlace de gestión de miembros lleva a la pantalla existente. Este corte no
migra sus escrituras ni presenta un flujo propio de aprovisionamiento. La ruta
histórica de miembro directo conserva su contrato, pero ahora exige que la
cuenta tenga tanto la membresía legacy activa como la membresía canónica activa
de la organización antes de informar éxito. Una cuenta sin esa membresía no
aparece por el solo hecho de existir en Auth; una vinculación histórica
incompleta requiere una intervención de datos independiente. Tampoco se
incorporan creación de organizaciones,
transferencia de propiedad ni edición de roles desde la nueva vista.

## Acceso de módulos en la interfaz

La política de rutas y visibilidad de módulos vive en
[module-access-policy.ts](../../src/modules/organizations/frontend/module-access-policy.ts).
Cada ruta operativa requiere todos los permisos de lectura que declara; por
ejemplo, `/payroll/employees` requiere `payroll.read` y `employees.read`.
Herramientas y las rutas que no pertenecen a un módulo operativo continúan
siendo públicas. La suscripción es una decisión separada de la autorización por
organización.

La barra lateral muestra solamente los módulos autorizados por la organización
activa y filtra sus subrutas con la misma política. Un módulo recordado o
solicitado en la URL que ya no esté autorizado no recupera su etiqueta ni su
subnavegación. Ante carga, error o falta de una organización, las rutas
protegidas no reciben una concesión optimista.

[OrganizationRouteGuard](../../src/modules/organizations/frontend/components/organization-route-guard.tsx)
envuelve el contenido de la aplicación y no monta el contenido de una ruta
protegida hasta resolver el acceso. Ante denegación muestra un estado accesible,
en vez de montar la página y dejar que esta inicie sus consultas. Es una frontera
de presentación: las rutas API siguen siendo responsables de autenticar y
autorizar cada operación en el servidor.

## Propiedad y composición

- [Organizations](../../packages/capabilities/organizations) conserva el dominio,
  los casos de uso y los adaptadores de persistencia y almacenamiento.
- [La composición Web](../../src/modules/organizations/backend/web-organization-actions.ts)
  reutiliza las factorías existentes de Organizations, Members y Access Control.
  Agrega autenticación por cookie y compatibilidad con el tenant operativo.
- [Los contratos HTTP](../../src/modules/organizations/contracts.ts) validan las
  proyecciones y las entradas de la Web; no sustituyen los contratos del dominio.
- [OrganizationProvider](../../src/modules/organizations/frontend/context/organization-context.tsx)
  expone el directorio y la selección, cancela lecturas reemplazadas y remonta el
  contenido al cambiar de usuario o tenant. Cambiar de organización elimina la
  empresa persistida en `kont-company-id` y usa la selección de tenant existente.

La separación entre usuario, organización, membresía y empresa corresponde al
[ADR 0008](../adr/0008-organizations-as-workspaces.md). Esta integración no cambia
la dirección de dependencias ni introduce React o Next.js en el dominio portable.

## API de la Web

Las rutas usan la sesión Web y `requireTenant`; no reemplazan la API nativa
`/api/client/v1/organizations`. Las respuestas correctas usan `{ data }`; los
errores usan `{ error, code }`. Todas llevan `Cache-Control: no-store`.

| Ruta | Métodos y propósito | Permiso adicional |
| --- | --- | --- |
| `/api/organizations` | GET: directorio accesible | Acceso activo validado |
| `/api/organizations/:id` | GET: detalle; PATCH: nombre y `expectedVersion` | PATCH: `organizations.update` |
| `/api/organizations/:id/logo` | POST: multipart `file` y `expectedVersion`; DELETE: JSON `expectedVersion` | `organizations.update` |
| `/api/organizations/:id/companies` | GET: empresas de la organización | `companies.read` |
| `/api/organizations/:id/members` | GET: membresías e invitaciones | `members.read` |
| `/api/organizations/:id/roles` | GET: roles de la organización | `roles.read` |

El directorio exige membresía y organización activas, con un rol activo asignado
a esa misma organización. Además, la organización debe tener un
`legacy_tenant_id` persistido y el usuario debe poder operar ese tenant como
propietario o miembro aceptado y no revocado. Una sesión por carnet queda
restringida al tenant de su terminal. Las rutas de detalle verifican que el
tenant seleccionado corresponda a la organización solicitada.

El adaptador compartido resuelve permisos mediante `role_id`,
`organization_roles` y `organization_role_permissions`. Una asignación ausente,
archivada o perteneciente a otra organización no concede acceso. El permiso
global del propietario exige el rol de sistema `owner` asignado correctamente;
la matriz histórica de permisos por nombre de rol deja de ser la fuente del
directorio de organizaciones.

## Puente de tenant operativo

`requireTenant` resuelve el tenant legacy únicamente cuando su organización
asociada está activa. Sin `X-Tenant-Id`, un propietario usa su propio tenant
solo si ese puente está activo; de lo contrario se selecciona la primera
membresía legacy activa que también tenga una organización activa. Un tenant
solicitado explícitamente debe estar activo y ser propio o tener una membresía
aceptada y no revocada; un tenant suspendido o sin puente se deniega, sin
retroceder a otra organización.

Las sesiones de carnet continúan fijadas al tenant de su terminal. No pueden
cambiar de tenant mediante el encabezado ni usar un fallback cuando el tenant
fijado deja de estar activo. El directorio histórico de membresías aplica el
mismo filtro de organizaciones activas, de modo que una selección persistida en
el navegador no puede restaurar un espacio suspendido.

Esta resolución limita el contexto tenant antes de las rutas API. No reemplaza
la autorización de recursos: cada ruta conserva sus permisos de servidor y sus
validaciones de pertenencia correspondientes.

## Compatibilidad y verificación

Este corte de organizaciones no agrega migraciones SQL. Una intervención
operativa acotada suspendió un espacio accidental que no tenía datos de negocio
asociados, sin borrar cuentas ni cambiar contraseñas; el espacio de trabajo
válido y su acceso de cajero se conservaron activos. Esa reparación de datos no
despliega por sí sola los cambios Web o API.

La suspensión conserva el registro de propietario exigido por la restricción
del último propietario; no elimina físicamente esa membresía. El código
actualizado impide que la organización suspendida conceda un contexto operativo
o aparezca como espacio seleccionable.

La ruta de miembros a la que enlaza depende de
[256_defer_direct_member_provisioning.sql](../../supabase/migrations/256_defer_direct_member_provisioning.sql):
el trigger de Auth se difiere para observar los metadatos confiables finales y
sincronizar las dos representaciones de acceso. Su despliegue y verificación se
documentan en [MIGRATIONS_OVERVIEW.md](../database/migrations/MIGRATIONS_OVERVIEW.md).
Requiere las tablas y asignaciones del modelo organizacional ya existentes.
La Web omite organizaciones sin correspondencia operativa válida en lugar de
inferir que el UUID de una organización es un UUID de tenant.

Las pruebas focalizadas están en
[web-organizations.test.ts](../../test/web-organizations.test.ts) y en
[los tests del adaptador](../../packages/capabilities/organizations/test/adapters).
La composición real del BFF se ejercita con respuestas de Supabase simuladas en
[web-organization-actions.test.ts](../../test/web-organization-actions.test.ts),
incluyendo aislamiento de terminales y denegación anterior a la consulta de miembros.
La visibilidad de módulos se comprueba en
[web-module-access.test.ts](../../test/web-module-access.test.ts); la selección
del tenant activo y el filtro del repositorio de membresías, en
[web-tenant-organization-access.test.ts](../../test/web-tenant-organization-access.test.ts).
Su existencia no implica que hayan aprobado en un entorno dado. La integración
debe validar esos tests, el paquete de organizaciones, TypeScript, lint de los
archivos afectados y el build Web, además de revisar navegación y cambios de
organización con una sesión autorizada.

La reversión del código no exige borrar organizaciones ni membresías: la
integración mantiene los identificadores y rutas operativas históricas. Los
cambios de nombre y logo realizados mediante la nueva API son datos persistidos
y no se deshacen al revertir una versión de la aplicación.
