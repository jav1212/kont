# Organizaciones en la Web

La Web incorpora una vista explícita de organización sobre el dominio existente
de `@kontave/organizations`. Es una integración inicial de presentación y
administración de identidad; las operaciones históricas conservan su contexto
de tenant. Este documento describe el código y el estado operativo conocido;
no acredita un despliegue de los cambios Web o API.

## Experiencia y alcance

El selector de organización aparece en la barra lateral incluso cuando hay un
solo espacio disponible. La empresa seleccionada y la cuenta personal siguen
siendo conceptos distintos. Configuración es una superficie Web de la
navegación principal: aparece junto a los módulos disponibles, sin entrar en
el catálogo portable de módulos del espacio de trabajo ni poder seleccionarse
como tal. Sus entradas se agrupan en Organización, Empresa y Cuenta personal;
las rutas directas de `/settings/*` activan esa superficie sin cambiar el
módulo operativo confirmado. El acceso **Configuración** del pie de la barra,
encima de **Ayuda**, activa esa misma navegación. Su contenido aprovecha el
ancho disponible y conserva márgenes laterales adaptables.

Cuando hay varias organizaciones, el selector abre un directorio buscable y
agrupa las cuentas propias (`owner`) bajo **Mi cuenta** y las demás membresías
directas bajo **Otras cuentas**; identifica la organización activa. Con una sola
organización, conserva visible su identidad pero no abre el directorio. El
acceso a **Gestionar organización** se muestra solamente si la comprobación
canónica de acceso al módulo para `/settings/organization` lo permite; no es una
concesión adicional de permisos. La implementación es exclusivamente de
interfaz: no cambia rutas ni datos persistidos; amplía de forma compatible la
proyección de espacio que consume.

Cada espacio puede incluir opcionalmente `avatarUrl` como dato aditivo de
presentación. La composición Web lo obtiene del directorio existente de
Organizations (`organizations.directory.listByOrganizationIds`) solo después de
filtrar el espacio por el puente tenant y la autorización canónica. El
directorio prefiere el avatar explícito de la organización y, cuando este falta,
conserva la presentación histórica usando el avatar del perfil del propietario
legacy; si ninguno existe, devuelve `null`. `logoUrl` sigue siendo la marca de
organización editable desde Configuración y no se reemplaza por este fallback.
Las mutaciones de nombre y logo vuelven a resolver la presentación antes de
devolver el espacio actualizado.

El selector usa `avatarUrl` antes de `logoUrl` y muestra la inicial del nombre
si la imagen no existe o no puede cargarse. Su campo de búsqueda expone el slot
`organization-search` para la normalización de la entrada. La subnavegación de
Configuración se presenta en la misma barra lateral y se filtra con la política
canónica de rutas; el layout de la ruta solo muestra encabezado y contenido,
sin rail secundario ni pestañas móviles propios.

El escaneo de clases de HeroUI se declara en
[globals.css](../../app/globals.css) con una ruta `@source` relativa a esa hoja
de estilos, para incluir las clases de superposición del tema instalado.

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
La suscripción es una decisión separada de la autorización por organización.

No existe una rama pública dentro de la aplicación autenticada. La política
clasifica cada página como `protected`, `authenticated` o `unknown`. Las rutas
personales y de herramientas están enumeradas como `authenticated`: requieren
una sesión resuelta y no permisos de organización. La carga o ausencia de sesión
no monta su contenido. Las rutas no registradas se deniegan. Las páginas del
sitio público bajo `app/(public)` no se incluyen en esta política.

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

El registro enumera de forma explícita las páginas operativas y las rutas de
configuración. Una ruta desconocida se deniega en vez de heredar el permiso de
su módulo padre. El control de rutas se puede contrastar con `pnpm audit:routes`,
que recorre páginas, navegación y handlers tenant para exigir una clasificación
de permiso canónico o autenticado; la auditoría compara rutas exactas antes de
permitir que una ruta estática coincida con una plantilla dinámica.

## Propiedad y composición

- [Organizations](../../packages/capabilities/organizations) conserva el dominio,
  los casos de uso y los adaptadores de persistencia y almacenamiento.
- [La composición Web de organizaciones](../../src/modules/organizations/backend/web-organization-actions.ts)
  reutiliza las factorías existentes de Organizations, Members y Access Control.
  Agrega autenticación por cookie y compatibilidad con el tenant operativo.
- [Los contratos HTTP](../../src/modules/organizations/contracts.ts) validan las
  proyecciones y las entradas de la Web; no sustituyen los contratos del dominio.

### Runtime de workspace Web

[WebApplicationController](../../src/modules/workspace/frontend/web-application-controller.ts)
es la única autoridad de selección de organización, empresa y módulo en la
aplicación autenticada. Compone un cliente portable mediante
`createKontaveClient`, pero registra únicamente las capacidades que este host
necesita: `workspace`, `operationContext` y `connectivity`. No construye el
cliente de aplicación completo empleado por Desktop ni convierte al kernel en
propietario de los dominios que consume.

El controlador restaura primero un directorio autorizado y luego crea un
`WorkspaceContextCoordinator` con proyecciones de organización, empresa y
módulo. Las entradas de `tid`, `cid`, almacenamiento del navegador y módulo
recordado son solo pistas: la selección se valida contra el directorio actual
antes de confirmarse. Al confirmar, actualiza la compatibilidad de navegador
(`kont-active-tenant-id`, `kont-company-id` y módulo) y conserva los demás
parámetros de la URL. Los providers históricos de tenant, organización y empresa
leen la instantánea confirmada; no mantienen una segunda selección.

La proyección Web de módulos conserva la política existente: permisos y rol
efectivo deciden la autorización, y la suscripción decide por separado si un
módulo de pago está disponible. Una organización sin `companies.read` puede
seguir exponiendo sus páginas personales autorizadas, aunque no tenga empresas
operativas para seleccionar.

Cada carga de workspace aborta la anterior y usa una revisión monotónica para
que una respuesta tardía no pueda confirmar una organización anterior. El
contenido de negocio se desmonta mientras el contexto está cargando, falla o
cambia de empresa; únicamente vuelve a montarse después de confirmar la última
selección válida. Al cerrar sesión se cancelan las solicitudes, se liberan los
recursos del runtime y se eliminan las pistas locales, sin eliminar datos de
negocio.

[GlobalInteractionBoundary](../../src/shared/frontend/components/global-interaction-boundary.tsx)
presenta los bloqueos del `GlobalInteractionGate` por encima de ese contenido.
Workspace, contexto operativo y conectividad adquieren leases independientes;
el bloqueo activo es el de mayor prioridad y liberar uno no libera los demás.
Los errores recuperables muestran una acción de reintento ligada al token del
bloque visible, para que un control obsoleto no vuelva a ejecutar otra
transición. La frontera bloquea la interacción y, cuando el flujo lo requiere,
desmonta el contenido protegido. El estado de conectividad se supervisa por
separado y no se confunde con una carga de workspace.

El contexto operativo conserva su propiedad en
[`@kontave/operation-context`](../../packages/operation-context). En este corte
se resuelve bajo demanda solo para `/inventory/operations/new`, después de que
una empresa y los permisos de creación de inventario estén confirmados. Su
fecha efectiva inicial se aplica al formulario nuevo; al restaurar un borrador,
este conserva su propia fecha. Las fórmulas monetarias históricas no se migran
ni se sustituyen en este cambio.

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
| `/api/organizations/:organizationId/companies/:companyId/operation-context` | GET: defaults operativos; PATCH: actualización versionada | Al menos uno de `inventory.read`, `sales.read` o `purchases.read`, más organización y empresa autorizadas |
| `/api/organizations/:organizationId/companies/:companyId/operation-context/exchange-rates?date=YYYY-MM-DD` | GET: tasas oficiales para la fecha local | El mismo alcance operativo autorizado |

Los handlers Web que aún usan `withTenant` están registrados por método y
plantilla exactos en
[web-api-route-access.ts](../../src/modules/organizations/backend/web-api-route-access.ts).
No hay inferencia genérica por verbo o nombre de módulo: las rutas sensibles
declaran `withTenantPermission` de forma explícita y las restantes resuelven su
permiso desde el registro. Una regla `null` significa solamente una sesión con
membresía activa para metadatos del shell o recordatorios propios; nunca acceso
anónimo. Las rutas de carnets usan `access.manage`.

`withTenantPermissions` rechaza en configuración una lista vacía. Esto impide
que una ruta nueva convierta por accidente una declaración de permisos ausente
en acceso autenticado.

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

La Web de compatibilidad también resuelve el `TenantContext` y cada
`requirePermission` a través de una instantánea canónica. La etiqueta legacy de
rol se conserva solamente para las integraciones antiguas; no concede privilegios
por sí misma. Un rol personalizado o una instantánea incompleta se degradan de
forma conservadora y cualquier fallo de consulta se deniega.

Los endpoints de contexto operativo usan la misma sesión por cookie y el tenant
seleccionado. Antes de leer, actualizar o resolver tasas, comprueban la
organización solicitada, la pertenencia de la empresa y al menos una capacidad
operativa. Las actualizaciones usan `expectedVersion`; una versión que ya no
coincide devuelve conflicto y exige recargar el contexto. La resolución de
tasas no crea una vía de acceso alternativa al contexto operativo.

La pantalla de roles lista con `roles.read` y permite gestionar solo roles
personalizados con `roles.manage` y `expectedVersion`. Los roles del sistema
permanecen bloqueados y el editor no escribe las definiciones globales legacy.

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

Los handlers de escritura que conservan operaciones combinadas requieren todas
las capacidades que podrían ejercer: actualizar empleados, guardar empresas y
guardar clientes de ventas exige tanto `create` como `update`. No se creó una
API nueva para separar esas operaciones; una sesión que puede registrar una
venta puede seleccionar un cliente existente, pero no guardar uno sin ambos
permisos.

## Compatibilidad y verificación

La presentación inicial de organizaciones no requirió migraciones SQL nuevas;
la autorización canónica de carnets añade la migración 257 descrita abajo. Una intervención
operativa acotada suspendió un espacio accidental que no tenía datos de negocio
asociados, sin borrar cuentas ni cambiar contraseñas; el espacio de trabajo
válido y su acceso de cajero se conservaron activos. Esa reparación de datos no
despliega por sí sola los cambios Web o API.

La suspensión conserva el registro de propietario exigido por la restricción
del último propietario; no elimina físicamente esa membresía. El código
actualizado impide que la organización suspendida conceda un contexto operativo
o aparezca como espacio seleccionable.

[257_organization_access_management_permission.sql](../../supabase/migrations/257_organization_access_management_permission.sql)
añade `access.manage` al catálogo canónico y lo concede solamente a los roles
activos de sistema `owner` y `admin`, incluidas las plantillas de organizaciones
nuevas. No modifica roles personalizados ni los roles base de cajero, vendedor
o contador. Su aplicación de base de datos no despliega el código Web o API.

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
Las regresiones de autorización Web y la resolución canónica se cubren en
[web-authorization-regression.test.ts](../../test/web-authorization-regression.test.ts)
y [web-canonical-authorization.test.ts](../../test/web-canonical-authorization.test.ts);
la gestión de roles se cubre en
[las pruebas de gestión de roles de Access Control](../../packages/capabilities/access-control/test/application/role-management.test.ts).
La integración del runtime se cubre en
[web-application-controller.test.ts](../../test/web-application-controller.test.ts),
[web-workspace-source.test.ts](../../test/web-workspace-source.test.ts),
[web-operation-context.test.ts](../../test/web-operation-context.test.ts) y
[web-global-interaction.test.tsx](../../test/web-global-interaction.test.tsx).
La validación local aprobó los tests focalizados, la auditoría de arquitectura y
rutas, el build de producción y el lockfile congelado. La verificación visual
en navegador de este flujo no se realizó porque no había navegador disponible;
esta evidencia no acredita un despliegue de producción.

Para el ajuste del selector y del escaneo de HeroUI, se informaron 25 pruebas
de autorización y estilos aprobadas, incluida
[web-heroui-styles.test.ts](../../test/web-heroui-styles.test.ts), junto con
`audit:routes` (82 páginas, 55 elementos de navegación y 151 handlers). La
verificación visual en navegador no se realizó porque no había un navegador
habilitado; tampoco constituye una declaración de despliegue de producción.

La reversión del código no exige borrar organizaciones ni membresías: la
integración mantiene los identificadores y rutas operativas históricas. Los
cambios de nombre y logo realizados mediante la nueva API son datos persistidos
y no se deshacen al revertir una versión de la aplicación.

La migración del runtime Web tampoco requiere migración de datos. Al revertirla,
las claves de selección de navegador pueden permanecer como pistas compatibles;
el host anterior debe continuar validando cualquier contexto restaurado. Esta
documentación describe el código del repositorio y no acredita un despliegue.
