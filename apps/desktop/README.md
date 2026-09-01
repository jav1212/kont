# Kontave Desktop

Cliente nativo de Kontave construido con Electron, React y `electron-vite`. La aplicación consume capacidades portables del monorepo y mantiene los detalles de Electron, IPC, almacenamiento seguro y HTTP dentro de sus adaptadores.

La aplicación Web de producción no depende de Desktop y no debe modificarse como parte del desarrollo de este cliente.

El proceso principal consume la composición portable en la dirección
`@kontave/client-contracts` → `@kontave/client-runtime` →
`@kontave/client-remote`: los contratos definen el límite serializable, el
runtime compone features y resultados tipados, y el adaptador remote provee los
puertos HTTP comunes. Todas las operaciones funcionales de Products, Inventory,
Purchasing, Sales, Profile, Billing, Organizations, Portal Monitoring y
seguridad atraviesan esa composición. Los controladores Desktop únicamente
adaptan esas features a IPC, lifecycle y snapshots de presentación; no
construyen transportes ni adaptadores remotos propios.

## Desarrollo

Desde la raíz del monorepo:

```bash
corepack pnpm install
corepack pnpm --filter @kontave/desktop dev
```

Verificación:

```bash
corepack pnpm --filter @kontave/desktop build
corepack pnpm --filter @kontave/desktop typecheck
corepack pnpm --filter @kontave/desktop test
corepack pnpm --filter @kontave/client-contracts check
corepack pnpm --filter @kontave/client-contracts test
corepack pnpm --filter @kontave/client-runtime check
corepack pnpm --filter @kontave/client-runtime test
corepack pnpm --filter @kontave/client-remote check
corepack pnpm --filter @kontave/client-remote test
corepack pnpm --filter @kontave/operation-context check
corepack pnpm --filter @kontave/operation-context test
```

El script `test` de Desktop ejecuta los archivos `src/**/*.test.ts` mediante
`tsx --test`; no es un check decorativo. Cubre, entre otros límites, validación
IPC, política del origen del renderer, registro del sender/frame confiable,
sanitización de fallos, almacenamiento seguro y workspace.

## Módulos organizacionales

Desktop obtiene los módulos disponibles mediante:

```http
GET /api/client/v1/organizations/{organizationId}/modules/available?platform=desktop
```

El sidebar puede presentar los siguientes códigos definidos por `@kontave/modules/domain`:

| Código       | Módulo       | Navegación disponible                                       |
| ------------ | ------------ | ----------------------------------------------------------- |
| `payroll`    | Nómina       | Tablero, empleados, configuración, calculadoras e historial |
| `purchases`  | Compras      | Tablero, proveedores, importación y archivo                 |
| `sales`      | Ventas       | Tablero, punto de venta, clientes, archivo e IGTF           |
| `inventory`  | Inventario   | Productos, departamentos, operaciones y reportes            |
| `accounting` | Contabilidad | Planes, cuentas, períodos, diario y reportes                |
| `tools`      | Herramientas | Divisas, calendario SENIAT y estado de portales             |
| `companies`  | Empresas     | Gestión de empresas                                         |
| `documents`  | Documentos   | Archivos y contratos                                        |

Que un destino aparezca en la navegación no implica que toda su pantalla sea nativa todavía. `module-navigation.tsx` declara únicamente la presentación soportada por Desktop; los identificadores, etiquetas y jerarquía pertenecen a `@kontave/navigation`.

## Packages utilizados

### Identidad y sesión

- `@kontave/auth/domain`
- `@kontave/auth/application`
- `@kontave/auth/supabase`

Proveen autenticación, almacenamiento seguro, renovación centralizada, reintento único y expiración global de sesión.

### Contexto de trabajo

- `@kontave/workspace-context-application`
- `@kontave/organizations/domain`
- `@kontave/delegated-access/domain`
- `@kontave/modules/domain`
- `@kontave/modules/application`

Coordinan organización, empresa y módulo activos. Las selecciones se persisten por usuario y organización mediante adaptadores Desktop.

### Navegación

- `@kontave/navigation`

Define destinos semánticos, jerarquía, parámetros dinámicos y breadcrumbs. Desktop no almacena rutas Web ni `href` como identidad de navegación.

### Contexto operativo e inventario

- `@kontave/operation-context/domain`
- `@kontave/operation-context/application`
- `@kontave/client-remote`
- `@kontave/monetary/domain`

El contexto operativo conserva por usuario, organización y empresa la fecha efectiva, moneda de presentación y tasa seleccionada. `@kontave/client-remote` provee el único `RemoteOperationContextStore`, que transforma el DTO remoto en el modelo de dominio y conserva la semántica de persistencia por empresa. Inventory y Sales lo reutilizan; Desktop ya no mantiene coordinadores ni conversiones DTO-a-dominio duplicados. El renderer recibe únicamente el snapshot resultante.

El tablero de Inventario termina su período en la fecha efectiva del contexto y presenta valores reales de entradas, salidas, movimientos y valoración. Las listas recientes consumen `recentInboundMovements` y `recentOutboundMovements`; no interpretan compras o ventas como flujo físico. Los campos comerciales heredados se conservan únicamente por compatibilidad del contrato.

La pantalla de Productos consume el read model compuesto de `products` e `inventory`: identidad, categorías y ciclo de vida pertenecen a Productos; existencia, reposición, movimientos y valoración pertenecen a Inventario. Desktop conserva decimales como strings, trata los cursores como opacos y nunca persiste stock, costos ni versiones como fuente de verdad. Las mutaciones usan concurrencia optimista y no se reintentan automáticamente ante conflictos `409`.

La ficha de Producto es un destino navegable. Identidad, reposición, precio comercial y tributación conservan versiones independientes; la analítica compara agregados ponderados de adquisiciones y ventas confirmadas sin presentar salidas manuales como ventas.

La pantalla visible como “Departamentos” administra `product-categories`; el nombre conserva la terminología de Producción, pero no representa departamentos organizacionales. Consume el overview agregado para conteos y productos sin categoría, y mantiene creación, edición y ciclo de vida dentro del package de Productos.

### Configuración y preferencias

- `@kontave/settings/contracts`
- `@kontave/settings/application`
- `@kontave/access-control/domain`

Settings resuelve qué opciones son visibles y si están disponibles, deshabilitadas o en modo de sólo lectura según plataforma, contexto, permisos, módulos y conectividad. Cada capability continúa siendo propietaria de sus datos; Settings no implementa un repositorio genérico de valores.

Desktop consume Preferences mediante el contrato HTTP compartido y conserva la arquitectura hexagonal: React llama una operación IPC tipada, el proceso principal utiliza `@kontave/client-remote` y el endpoint adapta la capability portable a Supabase. El renderer no conoce HTTP ni persistencia ni depende directamente del repositorio de preferencias.

### Experiencia del cliente

- `@kontave/client-connectivity/contracts`
- `@kontave/client-connectivity/application`
- `@kontave/client-interaction/application`
- `@kontave/client-feedback/application`
- `@kontave/client-updates/contracts`
- `@kontave/client-updates/application`
- `@kontave/client-updates/electron`

Cubren conectividad, bloqueos globales, errores copiables, recuperación y actualizaciones de la aplicación.

Las cargas exclusivas de Configuración se presentan mediante `GlobalInteractionGate`; no se renderizan mensajes de carga o error dentro de las pantallas. Los resultados exitosos y fallidos utilizan el sistema global de toasts. Cuando el backend devuelve un error, el toast muestra el tipo técnico y su acción copia el `requestId` único para soporte.

### Perfil, plan y estado

- `@kontave/client-contracts`
- `@kontave/client-remote`

Desktop consume contratos tipados y un cliente HTTP común para perfil, preferencias, seguridad, organización, miembros, roles, facturación, documentos y monitoreo de portales. El cliente se ejecuta en el proceso principal sobre el coordinador único de renovación de sesión.

### Dispositivos

- `@kontave/devices/contracts`
- `@kontave/devices/core`
- `@kontave/devices/node`

Gestionan descubrimiento, conexión, reconexión y eventos de dispositivos. Electron y SerialPort permanecen fuera del dominio portable.

### Interfaz

- `@kontave/ui/tokens`
- `@kontave/brand-assets`
- `@kontave/ui-dom`

Proveen tokens, branding y componentes DOM globales como sidebar, breadcrumbs, feedback, badges y controles.

## Endpoints nativos consumidos

| Endpoint                                                                                                              | Uso                                                    |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `GET /api/client/v1/me`                                                                                               | Perfil personal                                        |
| `GET /api/client/v1/organization-access`                                                                              | Organizaciones accesibles                              |
| `GET /api/client/v1/organizations/{organizationId}/companies`                                                         | Empresas de la organización activa                     |
| `GET /api/client/v1/organizations/{organizationId}/modules/available?platform=desktop`                                | Módulos instalados y compatibles                       |
| `GET /api/client/v1/organizations/{organizationId}/billing/overview`                                                  | Plan y resumen de facturación                          |
| `GET /api/client/v1/platform/status`                                                                                  | Estado de portales                                     |
| `GET/PATCH /api/client/v1/me`                                                                                         | Consulta y edición del perfil                          |
| `GET/PATCH /api/client/v1/me/preferences`                                                                             | Apariencia y preferencias regionales                   |
| `POST /api/client/v1/auth/change-password`                                                                            | Cambio de contraseña                                   |
| `GET/DELETE /api/client/v1/auth/sessions`                                                                             | Consulta y revocación de sesiones                      |
| `GET/PATCH /api/client/v1/organizations/{organizationId}`                                                             | Información de la organización                         |
| `GET /api/client/v1/organizations/{organizationId}/members`                                                           | Miembros e invitaciones                                |
| `GET /api/client/v1/organizations/{organizationId}/roles`                                                             | Roles y permisos                                       |
| `GET /api/client/v1/organizations/{organizationId}/billing/plans`                                                     | Planes disponibles                                     |
| `GET /api/client/v1/organizations/{organizationId}/billing/payment-requests`                                          | Solicitudes de pago                                    |
| `GET /api/client/v1/organizations/{organizationId}/documents`                                                         | Documentos del contexto activo                         |
| `GET /api/client/v1/organizations/{organizationId}/companies/{companyId}/operation-context`                           | Fecha, moneda y tasa efectivas                         |
| `GET /api/client/v1/organizations/{organizationId}/companies/{companyId}/inventory/dashboard`                         | Snapshot agregado del tablero de Inventario            |
| `GET/POST /api/client/v1/organizations/{organizationId}/companies/{companyId}/products`                               | Listado paginado y creación de productos               |
| `GET/PATCH /api/client/v1/organizations/{organizationId}/companies/{companyId}/products/{productId}`                  | Detalle y edición de productos                         |
| `POST /api/client/v1/organizations/{organizationId}/companies/{companyId}/products/{productId}/{activate,deactivate}` | Ciclo de vida sin eliminación física                   |
| `PATCH /api/client/v1/organizations/{organizationId}/companies/{companyId}/products/{productId}/inventory-profile`    | Stock mínimo versionado                                |
| `GET /api/client/v1/organizations/{organizationId}/companies/{companyId}/products/{productId}/movements`              | Historial auditable de sólo lectura                    |
| `GET /api/client/v1/organizations/{organizationId}/companies/{companyId}/products/{productId}/unit-economics`         | Comparación ponderada de adquisición y venta realizada |
| `GET/PATCH /api/client/v1/organizations/{organizationId}/companies/{companyId}/products/{productId}/sale-pricing`     | Política comercial versionada                          |
| `GET/PATCH /api/client/v1/organizations/{organizationId}/companies/{companyId}/products/{productId}/tax-profile`      | Tratamiento tributario versionado                      |
| `GET/POST/PATCH /api/client/v1/organizations/{organizationId}/companies/{companyId}/product-categories`               | Administración de categorías                           |
| `GET /api/client/v1/organizations/{organizationId}/companies/{companyId}/product-categories/overview`                 | Vista paginada y resumen de “Departamentos”            |
| `GET /api/client/v1/organizations/{organizationId}/companies/{companyId}/product-categories/{categoryId}`             | Detalle de categoría y cantidad de productos           |

Las pantallas de Configuración no realizan HTTP desde React: consumen operaciones IPC cerradas y el proceso principal aplica autenticación, renovación y errores tipados.

## Configuración nativa

El catálogo portable decide qué opciones aparecen según plataforma, permisos, conectividad y contexto activo. Las pantallas disponibles en Desktop cubren:

- Perfil personal y actualización del nombre.
- Tema y densidad sincronizados con las preferencias del usuario.
- Cambio de contraseña y sesiones autenticadas.
- Información general de la organización.
- Consulta de miembros, invitaciones, roles y permisos.
- Resumen de facturación, uso, planes y solicitudes de pago.
- Dispositivos conectados a la instalación.

La carga del snapshot utiliza single-flight por organización y empresa. Esto evita solicitudes duplicadas durante `React.StrictMode` y comparte una única operación cuando dos consumidores solicitan el mismo contexto simultáneamente. Un repositorio opcional sin permiso o no instalado no debe impedir cargar las demás secciones.

Documentos y empleados no pertenecen a la pantalla de Configuración: sus flujos se implementan dentro de los módulos Documentos y Empresas/Nómina respectivamente.

## Estructura

```text
src/
├── main/             Proceso principal, composición y adaptadores nativos
├── preload/          Implementación mínima del context bridge
├── renderer-bridge/  Protocolo IPC y proyecciones serializables por dominio
└── renderer/
    └── src/
        ├── auth/
        ├── inventory/
        ├── products/
        ├── purchasing/
        ├── sales/
        └── settings/ Presentación React organizada por capacidad
```

Reglas de dependencia:

- `renderer` no accede directamente a Node, Electron, Supabase ni secretos.
- `packages/kernel` posee los contratos y la orquestación funcional portable; las capacidades de experiencia y plataforma mantienen fronteras independientes.
- `renderer-bridge` no crea un segundo cliente: adapta contratos de
  `@kontave/client-contracts` y define únicamente proyecciones necesarias para
  cruzar IPC de forma serializable.
- `renderer-bridge/domains/<capacidad>` mantiene cada contrato en la carpeta de
  su dominio; `core` y `protocol` no contienen conocimiento de negocio.
- `preload` expone una operación cerrada por caso de uso y nunca entrega
  `ipcRenderer`, eventos Electron ni canales elegidos por el renderer.
- `main` implementa HTTP, almacenamiento seguro, Electron y dispositivos.
- Todo handler IPC cruza una matriz cerrada de canales, aridad y decodificadores
  runtime. Los decodificadores de `@kontave/client-contracts` rechazan campos
  inesperados y validan tipos, límites, enums, fechas y versiones antes de que
  un controlador privilegiado reciba la solicitud.
- Todo handler IPC valida el `webContents`, el frame principal y la URL exacta
  del documento confiable. El preload expone operaciones cerradas; los
  tableros derivan el actor de la sesión autenticada en main y no aceptan un
  `actorId` del renderer.
- Los packages portables no importan desde `apps/desktop`.
- Desktop puede depender de packages; los packages nunca dependen de Desktop.

## Límites de seguridad y operación

La ventana empaquetada carga exclusivamente el archivo renderer incluido en la
aplicación. En desarrollo, `ELECTRON_RENDERER_URL` solo se admite cuando
Electron no está empaquetado y su URL HTTP(S) usa `localhost`, `127.0.0.1` o
`[::1]`; otros orígenes se rechazan. La misma URL canónica se usa para validar
el origen del IPC.

Los errores que llegan al renderer usan códigos estables, mensajes públicos y
un `requestId` cuando corresponda. Diagnósticos de transporte, mensajes remotos
y causas inesperadas permanecen en el proceso principal y sus logs.

La sesión de Supabase permanece cifrada con `safeStorage` en main. Su archivo
se actualiza de forma serializada y atómica: cada reemplazo usa un temporal
único con permisos `0600`, lo renombra al destino y limpia el temporal si la
escritura o el renombrado fallan. Las dependencias nativas se inyectan en el adaptador únicamente
para probar estos escenarios sin exponerlas al renderer.

## Variables de entorno

Desktop requiere:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Opcionales:

```text
KONTAVE_API_URL
KONTAVE_SCANNER_PORT
```

`KONTAVE_API_URL` usa `https://kontave.com` cuando no se configura.

## Criterio para agregar una dependencia

Antes de agregar un package a `apps/desktop/package.json`:

1. Confirmar que la capability es propietaria del conocimiento utilizado.
2. Consumir su API pública; no importar archivos internos.
3. Mantener cualquier detalle Electron, HTTP o almacenamiento en un adaptador Desktop.
4. Registrar el package y su responsabilidad en este documento.
5. Verificar el build completo de Desktop.
