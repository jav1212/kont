# REQ-009 - Gestión de proveedores en Desktop

## Metadata

- ID: `REQ-009`
- Name: `Gestión de proveedores en Desktop`
- Status: `Planned`
- Priority: `High`
- Owner: `Product / Engineering`

## Objective

Implementar en el módulo Compras de Kontave Desktop la pantalla de proveedores, con consulta, búsqueda, filtrado, creación, edición, detalle y activación o desactivación, siguiendo la experiencia y la arquitectura ya validadas en Inventario, Productos y Categorías.

## Context

Desktop ya expone el destino `purchases.suppliers` dentro del grupo `Catálogos`, pero todavía no cuenta con una vista funcional ni con la cadena completa de contratos, casos de uso, adaptadores Supabase, API nativa e IPC necesaria para operarlo.

Los proveedores existentes se almacenan en `public.shared_inventory_suppliers` y son utilizados por facturas y otros documentos de compra. La implementación debe conservar esos datos y relaciones, pero el concepto debe ser propiedad del dominio de Compras (`purchasing`), no de la UI ni del módulo Inventario.

La solución debe seguir el patrón nativo ya usado por Productos y Categorías:

- contratos portables en `@kontave/native-api-contracts`;
- dominio y aplicación independientes de React, Electron, HTTP y Supabase;
- adaptador de persistencia en `@kontave/purchasing-supabase`;
- endpoints bajo `/api/native/v1`;
- controlador en el proceso principal de Desktop;
- API tipada compartida, IPC y exposición segura mediante preload;
- vista React específica del renderer usando `@kontave/ui-dom`.

No se debe consumir ni ampliar como dependencia de Desktop la API Web heredada `/api/purchases/suppliers`.

## Scope

Este requerimiento incluye:

- listado paginado de proveedores de la empresa seleccionada;
- resumen operativo de proveedores;
- búsqueda por razón social, nombre comercial, RIF, contacto, teléfono o correo;
- filtro por estado activo o inactivo;
- orden por nombre, RIF, cantidad o monto de documentos y fecha de actualización;
- creación de proveedores;
- consulta de detalle;
- edición de datos generales y de contacto;
- activación y desactivación con control de concurrencia optimista;
- visualización resumida de la actividad de compras del proveedor;
- permisos de lectura y escritura;
- estados de carga, vacío, error, actualización y conflicto;
- aislamiento por organización, tenant y empresa;
- contratos y pruebas automatizadas de comportamiento crítico.

## Out of scope

No se incluye:

- eliminación física de proveedores;
- órdenes de compra, recepción de mercancía o registro de facturas;
- cuentas por pagar, pagos, anticipos o conciliación bancaria;
- importación o exportación CSV masiva;
- adjuntos, documentos fiscales o expediente documental del proveedor;
- portal o autoservicio para proveedores;
- contactos múltiples, sucursales o cuentas bancarias múltiples;
- cambios amplios sobre la aplicación Web de producción;
- una migración destructiva o renombrado inmediato de `shared_inventory_suppliers`.

## Functional impact

### Supplier model

El proveedor debe exponer, como mínimo:

- `id`;
- `companyId`;
- `legalName` (razón social, obligatorio, máximo 200 caracteres);
- `tradeName` (nombre comercial, opcional, máximo 200 caracteres);
- `taxIdentifier` (RIF o identificador fiscal, opcional);
- `contactName`;
- `phone`;
- `email`;
- `address`;
- `notes`;
- `status`: `active | inactive`;
- `version`;
- `createdAt`;
- `updatedAt`.

La capa de persistencia debe mapear de forma compatible los campos heredados (`name`, `rif`, `contact`, `active`) al lenguaje canónico del dominio. Si se requieren columnas nuevas, deberán agregarse mediante una migración aditiva y con valores compatibles para los registros existentes.

### Business rules

- La razón social es obligatoria y se guarda sin espacios exteriores.
- El identificador fiscal se normaliza en mayúsculas y sin espacios.
- El correo, cuando se suministre, debe tener formato válido.
- No pueden existir dos proveedores activos de la misma empresa con el mismo identificador fiscal normalizado.
- Si el proveedor no posee identificador fiscal, se permite crearlo; el nombre no se usa como una identidad global.
- Un proveedor inactivo se conserva para mantener la trazabilidad histórica y no puede seleccionarse en nuevas operaciones de compra.
- Desactivar no modifica ni elimina documentos existentes.
- Reactivar vuelve a habilitar al proveedor para operaciones nuevas.
- Las actualizaciones de datos y estado requieren `expectedVersion` y deben fallar ante conflictos de versión.
- Los resultados solo pueden contener proveedores pertenecientes a la empresa solicitada.

### List and summary

El listado debe devolver páginas de hasta 25 elementos mediante cursor estable, sin duplicados al cargar más. El DTO de overview debe incluir:

- `items`;
- `nextCursor`;
- `total` según los filtros aplicados;
- `summary.active`;
- `summary.inactive`;
- `summary.withPurchases`;
- `summary.withoutPurchases`.

Cada fila debe mostrar razón social, RIF, contacto principal, estado, cantidad de documentos confirmados, total histórico confirmado en VES y última compra. Los totales monetarios deben representarse como decimales exactos serializados en texto.

### Detail

El detalle debe mostrar todos los datos del proveedor y una síntesis de actividad:

- documentos confirmados;
- monto total confirmado en VES;
- fecha de última compra;
- hasta 10 documentos recientes, con número, tipo, fecha, estado y total funcional.

La ausencia de compras es un estado válido y debe mostrarse explícitamente. La pantalla no debe inferir montos convirtiendo dinero en el cliente.

## Frontend impact

Crear una vista Desktop para `purchases.suppliers`, integrada en `apps/desktop/src/renderer/src/app.tsx` y en la navegación existente.

La experiencia mínima debe contener:

- encabezado `Proveedores` y descripción vinculada a la empresa seleccionada;
- acción de actualización manual;
- acción `Nuevo proveedor` visible solo con permiso de escritura;
- cuatro tarjetas de resumen: activos, inactivos, con compras y sin compras;
- campo de búsqueda con debounce;
- filtro de estado;
- selector de orden y dirección;
- tabla o lista accesible con carga incremental;
- estado vacío contextual;
- skeleton inicial y señal de refresco sin borrar los datos ya visibles;
- panel o diálogo de detalle;
- formulario reutilizable para crear y editar;
- confirmación explícita antes de desactivar;
- feedback de éxito y error mediante `@kontave/client-feedback-application` y `presentFeedback`;
- recuperación de conflictos de versión recargando el registro y permitiendo revisar los cambios.

Los controles y textos inline deben utilizar las primitivas correspondientes de `@kontave/ui-dom`, conforme al estándar de diseño. La vista debe ser utilizable con teclado, tener foco visible, etiquetas accesibles y comportamiento correcto en temas claro y oscuro y en el viewport compacto admitido por Desktop.

### Form fields

El formulario debe incluir:

- razón social, obligatoria;
- nombre comercial;
- RIF o identificador fiscal;
- persona de contacto;
- teléfono;
- correo electrónico;
- dirección;
- notas.

Debe impedir envíos duplicados mediante el mecanismo de mutación exclusiva ya usado por Desktop y conservar los valores escritos si el servidor rechaza la operación.

## Backend impact

### Domain and application

Ampliar `@kontave/purchasing-domain` sin introducir dependencias externas para representar los datos, normalizaciones, estados y transiciones requeridos.

Agregar en `@kontave/purchasing-application` puertos y casos de uso para:

- listar/consultar el overview;
- obtener un proveedor y su actividad;
- crear;
- actualizar;
- activar;
- desactivar.

Los casos de uso deben devolver errores esperados tipados para entrada inválida, duplicado fiscal, no encontrado, acceso denegado y conflicto de versión.

### Native API

Agregar contratos DTO y comandos en `@kontave/native-api-contracts` y endpoints bajo:

- `GET /api/native/v1/organizations/:organizationId/companies/:companyId/suppliers`;
- `POST /api/native/v1/organizations/:organizationId/companies/:companyId/suppliers`;
- `GET /api/native/v1/organizations/:organizationId/companies/:companyId/suppliers/:supplierId`;
- `PATCH /api/native/v1/organizations/:organizationId/companies/:companyId/suppliers/:supplierId`;
- `POST /api/native/v1/organizations/:organizationId/companies/:companyId/suppliers/:supplierId/activate`;
- `POST /api/native/v1/organizations/:organizationId/companies/:companyId/suppliers/:supplierId/deactivate`.

El GET de colección acepta `search`, `status`, `sort`, `direction`, `cursor` y `limit`. Los endpoints deben validar parámetros en el borde, usar el contexto autenticado nativo, ejecutar los casos de uso mediante composición/factory y devolver el envelope y los códigos de error estándar de la API nativa.

### Desktop adapter

Agregar:

- `DesktopSuppliersController` en el proceso principal;
- canales IPC específicos y tipados;
- métodos en `DesktopApi` y preload;
- registro de handlers y limpieza simétrica al cerrar la aplicación;
- serialización de errores sin exponer stack traces ni datos sensibles.

El renderer no debe realizar llamadas HTTP directas ni importar adaptadores de persistencia.

## Database impact

Reutilizar `public.shared_inventory_suppliers` durante esta fase para mantener compatibilidad con las facturas existentes.

Se requiere una migración aditiva que, como mínimo:

- agregue `version integer not null default 1` si aún no existe;
- preserve las columnas y datos heredados;
- implemente unicidad por `tenant_id`, `company_id` e identificador fiscal normalizado solo cuando este no esté vacío;
- mantenga índices adecuados para empresa, estado, búsqueda y paginación;
- proporcione RPCs o funciones transaccionales para lecturas agregadas y escrituras con control de versión;
- verifique en cada escritura la pertenencia del proveedor a la empresa y tenant efectivos;
- mantenga `updated_at` y la versión de forma atómica;
- no aplique `ON DELETE CASCADE` desde documentos de compra hacia proveedores.

La actividad y los totales deben derivarse de documentos de compra existentes; no se deben duplicar acumulados mutables en la tabla de proveedores salvo una decisión arquitectónica posterior y documentada.

## Security impact

- `purchases.read` es obligatorio para listar y consultar detalles.
- `purchases.create` es obligatorio para crear proveedores.
- El catálogo actual no posee `purchases.update`; este requerimiento debe agregarlo de forma aditiva al dominio y persistencia de control de acceso, asignándolo a las plantillas `owner`, `admin` y `accountant` de acuerdo con la política vigente.
- `purchases.update` es obligatorio para editar, activar y desactivar.
- La autorización se valida en servidor; ocultar una acción en Desktop no sustituye esa validación.
- `organizationId`, `companyId` y `supplierId` recibidos del cliente no se consideran prueba de pertenencia.
- RLS y los casos de uso deben impedir lectura o escritura cruzada entre tenants, organizaciones o empresas.
- Los mensajes y logs no deben exponer datos de contacto completos ni payloads sensibles.

## Billing/commercial impact

La función pertenece al módulo Compras existente. No introduce un nuevo plan, precio o límite. Solo debe estar disponible cuando el módulo Compras esté habilitado para la organización y el actor tenga los permisos correspondientes.

## Risks

- divergencia entre el modelo heredado (`name`, `rif`, `active`) y el lenguaje canónico de `Supplier`;
- duplicados históricos de RIF que impidan crear el índice único;
- agregados lentos por proveedor si no existen índices adecuados sobre documentos de compra;
- exposición accidental de proveedores de otra empresa por joins incompletos;
- tratar la desactivación como eliminación y romper trazabilidad histórica;
- reutilizar permisos de Inventario para un recurso propiedad de Compras;
- conflictos silenciosos si las escrituras no utilizan versión esperada;
- inconsistencias entre Web y Desktop mientras ambas superficies operan sobre la tabla compartida.

## Attack plan

### Phase 1 - Dominio, contratos y persistencia

- Objetivo: establecer el modelo portable y la fuente de datos canónica compatible con registros existentes.
- Áreas: `purchasing-domain`, `purchasing-application`, `purchasing-supabase`, contratos nativos, migraciones y control de acceso.
- Riesgo: alto.
- Criterio de éxito: reglas, aislamiento, duplicados, paginación y concurrencia cubiertos por pruebas; migración validada contra datos heredados.

### Phase 2 - API nativa e integración Desktop

- Objetivo: exponer casos de uso autenticados a Desktop mediante API nativa e IPC tipado.
- Áreas: route handlers nativos, composición, controlador principal, `desktop-api`, preload y registro IPC.
- Riesgo: medio.
- Criterio de éxito: todas las operaciones funcionan de extremo a extremo con permisos y errores normalizados, sin llamadas HTTP desde el renderer.

### Phase 3 - Experiencia de usuario y validación

- Objetivo: implementar listado, resumen, detalle y edición con la calidad visual y operativa de Productos y Categorías.
- Áreas: renderer Desktop, navegación, estilos y feedback.
- Riesgo: medio.
- Criterio de éxito: flujo completo accesible y responsive, estados de carga/error/vacío verificados y build/lint aprobados.

## Test plan

### Domain and application

- normalización de razón social, campos opcionales y RIF;
- rechazo de correo inválido y longitudes excedidas;
- creación con y sin identificador fiscal;
- rechazo de RIF activo duplicado dentro de la misma empresa;
- aceptación del mismo RIF en empresas o tenants distintos;
- activación y desactivación;
- proveedor inactivo rechazado en nuevas operaciones de compra;
- conflicto de versión en actualización y cambio de estado.

### Persistence and API

- paginación estable y filtros combinados;
- búsqueda normalizada;
- totales y documentos recientes solo de la empresa solicitada;
- aislamiento de tenant, organización y empresa;
- respuesta `404` para un proveedor inexistente o fuera del scope visible;
- respuesta de acceso denegado por cada permiso faltante;
- compatibilidad de lectura de registros heredados;
- montos exactos, notas de crédito con signo y proveedores sin compras.

### Desktop

- render de carga, datos y estado vacío;
- debounce y descarte de respuestas obsoletas;
- carga incremental sin duplicados;
- acciones visibles según permisos;
- prevención de doble envío;
- creación, edición, desactivación y reactivación;
- recuperación visible ante conflicto de versión;
- cambio de empresa invalida datos y carga el nuevo scope;
- navegación por teclado y foco del diálogo.

### Verification commands

La entrega debe aprobar, como mínimo:

```bash
pnpm lint
pnpm build
```

Además, deben ejecutarse las pruebas de los paquetes y de Desktop afectadas mediante los scripts definidos en sus respectivos `package.json`.

## Acceptance criteria

- El destino `purchases.suppliers` muestra una pantalla funcional para la empresa activa.
- Un actor con `purchases.read` puede buscar, filtrar, ordenar, paginar y consultar proveedores, pero no ve acciones de escritura si carece de esos permisos.
- Un actor autorizado puede crear un proveedor con los campos definidos y recibe feedback de éxito.
- Un actor autorizado puede editar, desactivar y reactivar usando control de versión.
- Un proveedor inactivo permanece visible al filtrar y conserva toda su historia, pero no puede usarse en compras nuevas.
- El detalle muestra datos de contacto y actividad de compra sin cálculos monetarios en el renderer.
- Los filtros y la paginación son ejecutados por servidor y permanecen limitados a la empresa activa.
- Un RIF duplicado activo en la misma empresa produce un error esperado y comprensible.
- Los conflictos concurrentes no sobrescriben cambios silenciosamente.
- No existe eliminación física desde Desktop.
- No se introduce una dependencia desde paquetes hacia aplicaciones ni entre aplicaciones.
- La aplicación Web de producción continúa funcionando con los datos y endpoints existentes.
- Los endpoints nativos validan autenticación, permisos y aislamiento de tenant/organización/empresa.
- La vista cumple los estados visuales, accesibilidad y temas definidos por el sistema de diseño.
- Build, TypeScript, lint y pruebas afectadas finalizan correctamente.

## Notes

- En la interfaz en español debe usarse `Razón social`; `legalName` se mantiene como nombre de contrato y dominio.
- La primera versión puede admitir un solo contacto principal. Los contactos múltiples quedan reservados para otro requerimiento.
- Antes de crear una restricción única debe auditarse la data heredada y definir una corrección no destructiva para RIF duplicados.
- Cualquier evolución futura del nombre físico de la tabla requiere un ADR o una migración de cutover independiente; no forma parte de este requerimiento.
