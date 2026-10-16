# Administración de empresas

## Copia selectiva de configuración (ADM-004/006)

`CreateCompanyFromExisting` y `CopyCompanyConfigurationToExisting` operan sobre dos empresas de la misma organización. Exigen lectura autorizada del origen y, respectivamente, permiso de creación o actualización en el destino, versiones esperadas e idempotencia. La selección explícita admite perfil operativo, formato de fecha y política monetaria mediante las RPC validadas. El core también modela una sección fiscal limitada a dirección y clasificación de contribuyente, vinculada a la revisión de la empresa de origen. Si el origen no tiene configurado un ajuste seleccionado, la operación falla; no persiste un valor supuesto. La transformación tipada comprueba que cada ajuste pertenezca al origen.

La identidad legal y tributaria de una empresa nueva se suministra de forma independiente. La copia nunca incluye RIF, nombre legal, naturaleza jurídica, logotipo, estado, numeración, documentos, existencias, nómina ni historial. `CompanyConfigurationCopyRepository` exige que la creación/copia y sus revisiones se confirmen en una sola transacción. El adaptador Supabase invoca las RPC de la migración aditiva `324_company_configuration_copy.sql`, aplicada en desarrollo como `20260930210242`. El smoke reversible verificó creación, copia de las tres secciones persistidas, reintentos, conflictos, denegación y ausencia de ajustes; no dejó fixtures. La extensión fiscal está preparada en [`363_company_configuration_copy_fiscal_settings.sql`](../../../supabase/migrations/363_company_configuration_copy_fiscal_settings.sql) y pasó una integración PGlite descartable (`pnpm --filter @kontave/companies test:fiscal-copy:integration`); el preflight y smoke reales siguen pendientes del MCP. El adaptador rechaza la sección antes de llamar a las RPC actuales hasta validar y aplicar la migración en Supabase. Los casos siguen acotados a estas configuraciones tipadas y no importan datos operativos.

Este paquete define el dominio y los casos de uso portables para administrar empresas dentro de una organización. La integración de Supabase está diseñada para un *composition root* de servidor de confianza; no se expone un cliente, una ruta HTTP ni una pantalla desde este paquete.

## Perfil fiscal tipado (ADM-025)

`GetCompanyFiscalProfile` expone el nombre legal, RIF y naturaleza de persona como contexto de solo lectura, junto con dirección fiscal opcional y tipo de contribuyente `ordinario` o `especial`. `ConfigureCompanyFiscalProfile` cambia únicamente los dos últimos campos mediante versión esperada, motivo y clave de idempotencia. Reintentos idénticos devuelven el resultado original; cambios con la misma clave o una versión obsoleta fallan. La bitácora registra las transiciones y no admite mutación.

`createCompanyFiscalProfileRepository` compone las RPC de [`333_company_fiscal_profile_adm_025.sql`](../../../supabase/migrations/333_company_fiscal_profile_adm_025.sql), solo para `service_role`. Las tablas de solicitudes y eventos son privadas con RLS. El [smoke reversible](../../../supabase/checks/company_fiscal_profile_adm_025_smoke.sql) cubre lectura, actualización, replay, conflictos, limpieza y auditoría.

El paquete pasó `check`, 107/107 pruebas y ESLint focal para este corte.

Este perfil no verifica identidad ni condición ante autoridades fiscales, no reescribe RIF históricos ni migra el JSONB heredado `config_fiscal`. No hay todavía consumidor Web.

## Series documentales reutilizables (ADM-017, ADM-018 y ADM-019)

El paquete persiste la configuración de varias series por tipo documental y alcance empresa o sucursal. Una serie tiene código, prefijo de presentación, límites y revisión. Una regla versionada puede elegir la serie por defecto de empresa, por defecto de sucursal o exigir selección explícita. Esa última política sirve para facturas (`sales_invoice`) sin crear un contador especial aparte.

`createSupabaseCompanyDocumentSeriesConfigurationRepository` compone las RPC de [`325_company_document_series_configuration.sql`](../../../supabase/migrations/325_company_document_series_configuration.sql), aplicada controladamente en desarrollo como `20261001151649`. Las RPC verifican el permiso `companies.update` y el ámbito autorizado antes de crear series o cambiar reglas; las tablas de series, reglas, solicitudes y eventos son privadas con RLS y las RPC se conceden únicamente a `service_role`.

`AllocateCompanyDocumentNumber` sigue siendo el contrato general para consumidores documentales. `@kontave/sales` ya lo realiza para `sales_invoice`: confirma un borrador y conserva la asignación en una transacción. Las demás familias documentales no tienen aún un emisor que implemente ese contrato. El [smoke de configuración](../../../supabase/checks/company_document_series_configuration_smoke.sql) y el [smoke de emisión de factura](../../../supabase/checks/sales_invoice_document_series_issuance_smoke.sql) documentan los cortes de desarrollo; no hay todavía integración Web.

## Estado de este incremento

Las migraciones [`285_company_administration.sql`](../../../supabase/migrations/285_company_administration.sql), [`286_company_document_numbering_settings.sql`](../../../supabase/migrations/286_company_document_numbering_settings.sql), [`287_company_administration_event_index.sql`](../../../supabase/migrations/287_company_administration_event_index.sql) y [`288_company_document_numbering_exhaustion_guard.sql`](../../../supabase/migrations/288_company_document_numbering_exhaustion_guard.sql) se aplicaron de forma controlada en el proyecto conectado `fvantswxhepvkloygcvc`, autorizado por el usuario como ambiente de desarrollo, con las versiones `20260928170107`, `20260928170118`, `20260928170637` y `20260928171246`. La 287 agrega el índice de consulta de eventos recomendado por el advisor; la 288 protege el agotamiento antes de que el formato de ocho dígitos trunque un número.

El preflight reproducible [`company_administration_preflight.sql`](../../../supabase/checks/company_administration_preflight.sql) confirmó, antes del despliegue, 74 empresas sin desajustes de organización/tenant, 28 facturas sin duplicados, los contadores dentro de `1..99_999_999`, sin próximos números ocupados, RLS habilitado y el índice único parcial de numeración válido. También detectó que `lpad(..., 8, '0')` trunca `100_000_000` a ocho dígitos; por ello la configuración limita ambos correlativos a `99_999_999`. Las cinco RPC y las cuatro columnas administrativas estaban ausentes antes de aplicar 285/286.

La prueba de humo [`company_administration_smoke.sql`](../../../supabase/checks/company_administration_smoke.sql) aprobó 30 comprobaciones mediante MCP contra desarrollo y revirtió sus fixtures en una subtransacción. Cubrió alta, idempotencia, permisos, aislamiento, versiones obsoletas, límites/formato, auditoría, suspensión, agotamiento y la asignación real de factura y nota de entrega. Dos carreras reales en conexiones PostgreSQL distintas validaron que un ajuste concurrente recibe `COMPANY_VERSION_CONFLICT`, y que una venta espera el bloqueo de un ajuste para asignar el número actualizado. Sus fixtures aislados se eliminaron después por sus IDs derivados de claves únicas. Las pruebas PGlite locales no se ejecutaron porque la dependencia no está disponible en el workspace; MCP tampoco tenía alcance para consultar logs o ramas del proyecto.

### Incremento siguiente: correlativos comerciales

El paquete ahora expone lectura y edición versionada de los dos próximos correlativos existentes: factura de venta y nota de entrega. El contrato requiere `companies.update`; rechaza números fuera de `1..99_999_999`, revisiones obsoletas y cualquier retroceso. La migración 286 bloquea la misma fila que la RPC heredada de ventas, comprueba que el número elegido no esté ya ocupado, modifica solo esas dos columnas y registra quién ajustó la configuración. La migración 288 usa `100_000_000` únicamente como centinela de lectura para serie agotada: no es configurable y el siguiente intento de asignación devuelve `COMPANY_DOCUMENT_NUMBER_EXHAUSTED`. Requiere 285.

Las migraciones 286 y 288 no reservan ni emiten números, no alteran facturas existentes y no configuran prefijos o numeración fiscal. La asignación sigue en la RPC de Ventas. No hay todavía integración Web; una futura composición de servidor deberá derivar actor/organización de la sesión autenticada. La prueba PGlite extendida sigue pendiente porque PGlite no está instalado en el workspace.

## Política monetaria empresarial

Las migraciones [289](../../../supabase/migrations/289_company_monetary_policy.sql) y [290](../../../supabase/migrations/290_company_monetary_policy_revision_index.sql) añaden una política monetaria tipada y versionada por empresa, con su índice de revisión. Se aplicaron en el proyecto de desarrollo autorizado `fvantswxhepvkloygcvc` con las versiones `20260928180913` y `20260928182149`. El preflight, el smoke de 19 grupos y dos carreras PostgreSQL reales validaron permisos, idempotencia, inmutabilidad, aislamiento y concurrencia; los fixtures se eliminaron y las huellas conservaron 74 empresas y 28 facturas. Esta evidencia no implica políticas configuradas para clientes ni integración Web.

La política inicial es restrictiva por compatibilidad: moneda operativa `VES` con escala 2, referencias no vacías de `USD`/`EUR`, fuente `bcv`, perfil `commercial_v1` (`half_up`) y solo tasa oficial fresca de la fecha exacta. No habilita tasas manuales, fecha anterior, cambio de moneda funcional ni multimoneda completa. La versión de política es independiente de `Company.version` y de los correlativos comerciales.

El paquete expone `GetCompanyMonetaryPolicy`, `ConfigureCompanyMonetaryPolicy` y `ResolveCompanyMonetaryContext`; el último genera un `CompanyMonetaryContextSnapshot` JSON seguro. `convertWithCompanyMonetaryContext` vuelve a calcular desde ese snapshot sin consultar la configuración o proveedor actuales. Leer una política ausente devuelve `null` y no crea una; resolverla devuelve `COMPANY_MONETARY_POLICY_NOT_CONFIGURED`.

La configuración exige `companies.update`, empresa activa, `expectedPolicyVersion`, clave de idempotencia y motivo. La consulta requiere `companies.read`. El actor y la organización pertenecen a una sesión autenticada del servidor, no a valores proporcionados por el cliente. `createCompanyMonetaryPolicyRepository({ url, serviceRoleKey })` se usa únicamente en ese límite de confianza y llama a RPC reservadas a `service_role`.

Persistir el snapshot con el documento y su estado/idempotencia en la misma transacción es responsabilidad del futuro consumidor. No se integra aún con Ventas, Facturación o Web, ni modifica documentos, JSON o importes heredados. Consulte [el plan y estado del corte](../../../docs/project/PLAN_POLITICA_MONETARIA_EMPRESARIAL.md) para el contrato, recuperación y cobertura ADM-003/020/021/022.

## Formato de fecha empresarial (ADM-023)

`GetCompanyDateFormat` lee la convención actual o una revisión histórica; si nunca se configuró, devuelve `null` sin crear un valor predeterminado. `ConfigureCompanyDateFormat` requiere `companies.update`, empresa activa, `expectedFormatVersion`, motivo y clave idempotente. Cada revisión es independiente de `Company.version`; empresas suspendidas conservan lectura histórica, pero no admiten cambios.

Los órdenes admitidos son `day_first`, `year_first` y `month_first`. `formatCompanyDate` solo acepta fechas civiles ISO reales (`YYYY-MM-DD`), valida años bisiestos y no transforma el día a través de una zona horaria. La función retorna respectivamente `DD/MM/YYYY`, `YYYY-MM-DD` y `MM/DD/YYYY`. `parseCompanyDate` realiza la operación inversa con los mismos separadores y componentes con cero a la izquierda: exige el orden explícito de la empresa, por lo que `03/04/2026` se interpreta como 3 de abril o 4 de marzo solo según ese orden, nunca según el navegador o la región del usuario. La migración [20260928184000](../../../supabase/migrations/20260928184000_company_date_format.sql) se aplicó en desarrollo como versión MCP `20260928184933`; el smoke reversible y dos carreras PostgreSQL están documentados en la [matriz de ProfitPlus](../../../docs/audit/profitplus-administracion-packages-2026-09-28.md). La preferencia ya tiene consumidores Web acotados; otros formularios y vistas aún deben adoptarla de forma explícita.

## Logotipo empresarial (ADM-024)

`SetCompanyLogo` permite cargar, sustituir o retirar el logotipo de una empresa. Exige `companies.update`, versión esperada y empresa existente; `null` retira la referencia. La imagen debe ser PNG, JPEG o WebP, corresponder a su firma binaria y no superar 5 MiB. La actualización de `logo_url` usa la misma revisión optimista de la empresa y registra el cambio en una bitácora inmutable separada.

`createCompanyLogoStorage` es un adaptador exclusivo del servidor de confianza: escribe y elimina mediante `service_role` en el bucket público de solo lectura `company-logos`. Cada objeto nuevo usa la ruta `organización UUID/ID de empresa codificado como hexadecimal UTF-8/UUID.ext`; el identificador no se normaliza, por lo que los RIF heredados conservan mayúsculas y bytes exactos. El adaptador nunca elimina URLs heredadas ni rutas ajenas. Si falla la persistencia después de una carga, solo compensa el objeto tras releer la empresa y demostrar que esa URL no quedó guardada; la limpieza del archivo anterior ocurre después del commit y es de mejor esfuerzo.

Las migraciones [20260928190000](../../../supabase/migrations/20260928190000_company_logos.sql) y [20260928192000](../../../supabase/migrations/20260928192000_company_logo_event_fk_index.sql) se aplicaron de forma controlada en el proyecto de desarrollo autorizado `fvantswxhepvkloygcvc`, con versiones MCP `20260928190921` y `20260928191331`. El [preflight](../../../supabase/checks/company_logo_preflight.sql) y el [smoke reversible](../../../supabase/checks/company_logo_smoke.sql) validaron el esquema, permisos, RLS, inmutabilidad y bucket. No hubo backfill ni carga de objetos: las URLs heredadas existentes se conservaron. La Web y los generadores PDF aún no consumen este contrato.

## Contrato de aplicación

`Company` es el agregado de una organización: identidad, razón social, nombre comercial, RIF venezolano opcional, perfil operativo, estado y `version`. `CompanyStatus.Active` y `CompanyStatus.Suspended` son las transiciones administrables; `Archived` se conserva como estado de lectura, sin transición administrativa expuesta.

Las mutaciones reciben siempre `actorUserId` y `organizationId`. Antes de escribir, los casos de uso invocan `CompanyAdministrationAuthorization.assertCanManageCompanies(scope, operation, permission)`, con la operación concreta y el permiso existente correspondiente. El actor debe venir de autenticación verificada en el servidor: no aceptar un ID elegido por el cliente como prueba de identidad.

| Caso de uso | Comando | Resultado esperado |
| --- | --- | --- |
| `CreateCompany` | `CreateCompanyCommand` con `idempotencyKey`, identidad legal y perfil | Devuelve el alta original o la nueva instantánea autoritativa. |
| `UpdateCompany` | `UpdateCompanyCommand` con al menos un campo mutable y `expectedVersion` | Devuelve la empresa con una revisión mayor. |
| `SuspendCompany` | `CompanyLifecycleCommand` con `expectedVersion` | Pasa de `active` a `suspended`. |
| `ActivateCompany` | `CompanyLifecycleCommand` con `expectedVersion` | Pasa de `suspended` a `active`. |

Ejemplo de creación con la firma actual:

```ts
const company = await new CreateCompany(authorization, repository).execute({
  actorUserId,
  organizationId,
  idempotencyKey: "company-create-2026-09-28-001",
  legalName: "Empresa Ejemplo, C.A.",
  tradeName: "Ejemplo",
  taxId: taxId("J-29767818-2"),
  country: CompanyCountry.Venezuela,
  operatingProfile: "standard",
  personNature: "juridical",
});
```

Para editar, suspender o activar, el consumidor debe enviar la `version` de la instantánea que leyó. Una respuesta `COMPANY_VERSION_CONFLICT` obliga a recargar y resolver el cambio; no debe reintentarse con una versión inventada. Una clave de idempotencia de creación se limita a la organización y a la intención normalizada, por lo que reutilizarla para otro actor o contenido devuelve `COMPANY_IDEMPOTENCY_CONFLICT` cuando la migración esté desplegada.

## Puertos y adaptador

`CompanyAdministrationRepository` es el puerto de escritura versionada: `create`, `update`, `setPersonNature` y `setStatus`. `CompanyRepository` queda para consumidores heredados que listan, buscan o guardan una instantanea completa; su `save` es exclusivo de servidor de confianza.

`createCompanyAdministrationRepository({ url, serviceRoleKey })` compone el adaptador Supabase. El alta tipada llama `create_native_company_with_person_nature`; las ediciones y transiciones usan RPC versionadas que comprueban organizacion, membresia, rol activo y el permiso `companies.create` o `companies.update`. Estas RPC solo se conceden a `service_role`.

La migración 285 agrega `trade_name`, `country`, `status` y `version` a `shared_companies`; registra solicitudes de creación y eventos administrativos; y hace avanzar la versión en actualizaciones. Asigna UUID independientes del RIF para las altas nuevas y previene RIF canónicos duplicados en nuevas altas/cambios, pero conserva los duplicados históricos y no crea un índice único. Cualquier saneamiento histórico queda fuera de este incremento y requiere una tarea autorizada aparte.

## Compatibilidad y salida gradual pendientes

La consulta MCP confirmó también campos heredados de `shared_companies`, como `config_fiscal`, contacto, ajustes de nómina e inventario y correlativos comerciales. `logo_url` ya está integrado mediante el caso ADM-024; el resto no forma todavía una configuración empresarial tipada. Antes de conectar un cliente de producción, verificar una migración compatible y que los escritores heredados avancen `version`. El cliente puede usar los nuevos casos de uso cuando el servidor componga el actor autenticado y el adaptador de servicio; este paquete no añade rutas ni UI.

No se ha demostrado que todos los consumidores actuales rechacen empresas suspendidas, ni se ha cerrado el control de escrituras directas heredadas/RLS. MCP confirmó grants directos `UPDATE` y `TRUNCATE` para `anon` y `authenticated`; RLS limita el DML observado, pero esta evidencia no acredita que el recorrido Web esté libre de exposición. Los advisors mantienen hallazgos heredados de `search_path` mutable, funciones `security definer` expuestas y rendimiento de RLS. Las tablas privadas de solicitudes y eventos tienen RLS habilitado sin políticas por diseño: solo las RPC `security definer` de servicio acceden a ellas. Cada capacidad operativa que requiera una empresa activa debe invocar `Company.assertOperational()` o aplicar una regla equivalente en su límite de autorización.

## Verificación del corte monetario

Pasaron 39/39 pruebas de empresas, 23/23 de la biblioteca monetaria, los chequeos de tipos de 16 proyectos dependientes, TypeScript raíz y ESLint. El [registro de validación](../../../docs/audit/company-monetary-policy-validation-2026-09-28.json) conserva las versiones de migración, los 19 grupos del smoke, las dos carreras reales, las ACL y las huellas antes/después. Las cuatro tablas monetarias quedaron vacías tras limpiar los fixtures; la configuración de clientes requiere una acción explícita posterior.

### Evidencia histórica del corte administrativo 285–288

Pasaron 29/29 pruebas del paquete, su chequeo TypeScript y ESLint, además de `corepack pnpm exec tsc --noEmit --incremental false` en la raíz sin diagnósticos. En desarrollo, la prueba de humo de migraciones y RPC aprobó 30/30 comprobaciones y revirtió sus fixtures; dos carreras reales en conexiones distintas verificaron el bloqueo contra otro ajuste y contra Ventas, y sus fixtures aislados se eliminaron por IDs derivados de claves únicas. La huella posterior conservó 74 empresas y 28 facturas, sin solicitudes, eventos ni clientes de prueba persistentes; las huellas de datos originales fueron `c8d749b99c24b3da7e562af2c93c73fd` para empresas y `631370951efb1248356739dbc5671550` para facturas. Esta evidencia no certifica la integración Web ni una cobertura completa de las escrituras heredadas/RLS.

Para repetir: `corepack pnpm --filter @kontave/companies check` y `corepack pnpm --filter @kontave/companies test`. La prueba `corepack pnpm --filter @kontave/companies test:integration` necesita PGlite disponible; puede localizarse mediante `PGLITE_MODULE_PATH` sin añadirlo como dependencia de producción. No utiliza credenciales ni conexiones a Supabase.

### ADM-008: alta de sucursales

El paquete expone `CreateCompanyBranch` y `ListCompanyBranches`; el código se normaliza a mayúsculas y es único por empresa, el nombre se valida y el alta exige una clave idempotente. El adaptador `createCompanyBranchActions({ url, serviceRoleKey })` debe componerse únicamente en servidor y recibe el actor desde la sesión autenticada. Supabase vuelve a comprobar `branches.create`/`branches.read` y limita cada operación a la empresa indicada.

La migración [`296_company_branches.sql`](../../../supabase/migrations/296_company_branches.sql) se aplicó en el proyecto de desarrollo autorizado como versión `20260928193214`; las migraciones [`297`](../../../supabase/migrations/297_company_branch_fk_indexes.sql) y [`298`](../../../supabase/migrations/298_company_branch_tenant_fk_index.sql) agregan cobertura para las claves foráneas según el advisor. El [smoke](../../../supabase/checks/company_branch_smoke.sql) usa un fixture transaccional y verifica permisos, unicidad, idempotencia, bitácora y rollback. No asigna usuarios, documentos ni movimientos a una sucursal, y no activa selección operativa/Web. Los cuatro índices FK aparecen como no usados mientras las tablas permanezcan vacías; no quedan hallazgos de FK sin índice.

### ADM-009: selección de sucursal

`GetCompanyBranchSelection` devuelve la elección versionada del usuario dentro de organización/empresa, o una versión vacía `0`. `SelectCompanyBranch` elige o limpia con control de versión y rechaza IDs que no tengan forma UUID; la RPC vuelve a validar pertenencia a la empresa. Usa permisos `branches.read` y `branches.select`. `createCompanyBranchActions` expone `getSelection` y `select` además de alta/listado. Componer el actor desde la sesión autenticada sigue siendo responsabilidad del servidor.

La migración [`299_company_branch_selection.sql`](../../../supabase/migrations/299_company_branch_selection.sql) se aplicó en desarrollo como `20260928200007`. El [smoke](../../../supabase/checks/company_branch_selection_smoke.sql) verificó selección, cambio, limpieza, conflictos, aislamiento, auditoría y rollback. No propaga aún la elección a operaciones ni al cliente Web.

### ADM-011: asociar usuarios a sucursales

`ListCompanyBranchMemberships` y `SetCompanyBranchMembership` mantienen una asignación versionada por empresa, sucursal y usuario. Solo se asignan miembros activos de la misma organización y los cambios requieren `branches.assign_users`. La asignación es un límite de recurso: el usuario también necesita el permiso de rol `branches.select`; el permiso `branches.select_any` permite a owner/admin seleccionar sucursales sin asignación individual. Para otros usuarios, el catálogo queda filtrado por sus sucursales asignadas y la RPC valida la selección. Revocar una sucursal limpia la selección vigente en la misma transacción y registra ambos eventos de auditoría. El cambio usa el mismo bloqueo por usuario/organización/empresa que la selección para evitar carreras de revocación.

La migración aditiva [`300_company_branch_memberships.sql`](../../../supabase/migrations/300_company_branch_memberships.sql) está aplicada en el proyecto de desarrollo autorizado. El [smoke transaccional](../../../supabase/checks/company_branch_membership_smoke.sql) comprobó asignación, denegación sin asignación, filtrado, selección y limpieza por revocación; revirtió fixture y permisos temporales. No hay interfaz ni integración Web/native, y la selección aún no limita documentos o movimientos operativos.

### ADM-027: identificaciones tributarias secundarias

`GetCompanySecondaryTaxIdentifiers`, `SetCompanySecondaryTaxIdentifier` y `RemoveCompanySecondaryTaxIdentifier` administran varios identificadores por empresa, jurisdicción y clave de esquema. La clave se normaliza a mayúsculas/minúsculas según su formato; el valor se conserva opaco tras quitar espacios externos. El paquete valida sintaxis y límites, pero no declara válido un identificador ante ninguna autoridad fiscal.

La lectura requiere `companies.read`; la configuración y el retiro requieren `companies.update` y revisión optimista por slot. Retirar un identificador conserva su revisión y evento, pero borra el valor tributario. La migración aditiva [`317_company_secondary_tax_identifiers.sql`](../../../supabase/migrations/317_company_secondary_tax_identifiers.sql) está aplicada y validada en el proyecto de desarrollo autorizado. El [preflight](../../../supabase/checks/company_secondary_tax_identifiers_preflight.sql) confirmó las tablas ausentes antes del cambio y el [smoke transaccional](../../../supabase/checks/company_secondary_tax_identifiers_smoke.sql) comprobó el ciclo RPC completo con verificación de auditoría y `ROLLBACK`; las tablas quedaron vacías y sin acceso directo de roles cliente/servicio. No hay ruta ni consumidor Web.

### ADM-028: naturaleza de la persona

`Company.personNature` distingue `natural` y `juridical`, de acuerdo con las categorías generales del artículo 15 del Código Civil venezolano. No representa la condición `ordinario`/`especial`, no codifica formas jurídicas como C.A. o S.R.L. y no se infiere del RIF. Las empresas existentes conservan `NULL` hasta una clasificación verificada; las altas nuevas del paquete requieren un valor explícito.

`SetCompanyPersonNature` modifica el dato con permiso `companies.update`, revisión optimista e idempotencia para repetir el mismo valor. Las RPC nuevas son `create_native_company_with_person_nature` y `set_native_company_person_nature`; mantienen intacta la firma heredada `create_native_company`. La migración aditiva [`318_company_person_nature_adm_028.sql`](../../../supabase/migrations/318_company_person_nature_adm_028.sql) se aplicó en desarrollo como `20260929171815`. El [smoke](../../../supabase/checks/company_person_nature_adm_028_smoke.sql) validó alta, idempotencia, cambio versionado, auditoría y `ROLLBACK`; las 74 empresas históricas siguen sin clasificación automática. No hay ruta ni consumidor Web.

### ADM-013: presencia de sucursales en línea

`RecordCompanyBranchHeartbeat` actualiza la presencia de una instancia UUID de cliente usando hora del servidor. El actor requiere `branches.connect`, `branches.select` y membresía activa en esa sucursal, salvo `branches.select_any`. `ListCompanyBranchConnectivity` devuelve estado y conteos agregados por sucursal visible, sin exponer usuarios ni dispositivos. Una sucursal se considera en línea si al menos un latido autorizado ocurrió en los últimos 90 segundos; conserva además la hora del último contacto para sucursales que ya expiraron. El cliente debe generar y persistir su UUID de instancia, y enviar los latidos mientras opere en la sucursal.

`createCompanyBranchConnectivityActions({ url, serviceRoleKey })` compone ambos casos de uso para servidor; el adaptador usa exclusivamente `record_native_company_branch_heartbeat` y `get_native_company_branch_connectivity`. Las migraciones [`304`](../../../supabase/migrations/304_company_branch_online_connectivity.sql) y [`305`](../../../supabase/migrations/305_company_branch_presence_fk_indexes.sql) fueron validadas en desarrollo, con el [smoke transaccional](../../../supabase/checks/company_branch_connectivity_smoke.sql), sin dejar presencia ni otros fixtures. La lectura directa queda revocada incluso para `service_role`; la tabla solo se toca dentro de las RPC autorizadas. No está integrada a los clientes ni habilita operación offline; eso permanece pendiente bajo ADM-014.
