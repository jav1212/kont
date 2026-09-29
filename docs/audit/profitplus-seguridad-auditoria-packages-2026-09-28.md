# Cobertura de seguridad y auditoría de Profit Plus en paquetes

Fecha de revisión: 2026-09-29.

Esta revisión contrasta los 51 casos de uso de **Usuarios, seguridad y auditoría** del catálogo `02_usuarios_seguridad_y_auditoria.md` entregado para el proyecto con la base portable en `packages/`. La etapa autorizada es completar y validar los paquetes; la integración con la Web de producción queda para una etapa posterior.

La revisión **no cierra todavía los 51 casos de extremo a extremo** ni debe interpretarse como una cobertura automática del 100 %. Expone qué existe en el core portable y qué falta para que cada regla sea persistente y esté exigida por los consumidores de producción.

## Estado de la base y cómo leer la matriz

- **Completo (paquetes)**: hay contrato, adaptador y migración para la capacidad. No equivale a despliegue o adopción por la Web.
- **Implementado (paquetes)**: la capacidad tiene dominio, aplicación, adaptador y migración probados en esta base; su despliegue puede estar confirmado sin que exista todavía un consumidor productivo.
- **Parcial**: hay una parte reutilizable o persistente, pero falta una condición de producción, como configuración externa o adopción por el comando consumidor.
- **Pendiente**: no hay una implementación que cubra el caso en los paquetes.

Las migraciones [291](../../supabase/migrations/291_user_security_access.sql), [292](../../supabase/migrations/292_operational_audit_trail.sql), [293](../../supabase/migrations/293_account_security_policies.sql), [294](../../supabase/migrations/294_sales_security_operations.sql), [295](../../supabase/migrations/295_payment_orders_audit.sql) y [309](../../supabase/migrations/309_operational_audit_internal_privileges.sql) se desplegaron correctamente el 2026-09-29 mediante Supabase MCP en el proyecto remoto `fvantswxhepvkloygcvc`. Esto no migra la Web de producción: una autorización portable o `ExecuteAuthorizedOperation` no protege automáticamente una pantalla, ruta, RPC o comando existente; cada consumidor debe componerlo.

El despliegue de los permisos aditivos 291, 292 y 295 expuso una incompatibilidad de un consumidor de autorización anterior al cargar espacios de trabajo. El [registro del incidente](workspace-permission-incident-2026-09-29.md) documenta la causa y la corrección compatible ya confirmada por el usuario en producción.

| Migración | Versión remota | Resultado |
| --- | --- | --- |
| 291 `user_security_access` | `20260929133358` | Aplicada correctamente |
| 292 `operational_audit_trail` | `20260929133409` | Aplicada correctamente |
| 293 `account_security_policies` | `20260929133419` | Aplicada correctamente |
| 294 `sales_security_operations` | `20260929133432` | Aplicada correctamente |
| 295 `payment_orders_audit` | `20260929133449` | Aplicada correctamente |
| 309 `operational_audit_internal_privileges` | `20260929133604` | Aplicada correctamente; revoca `EXECUTE` a `public`, `anon`, `authenticated` y `service_role` sobre los helpers internos de auditoría. |

La migración 308 corresponde a trabajo concurrente ajeno y no fue aplicada por este despliegue.

Las migraciones [311](../../supabase/migrations/311_security_web_queries.sql), [312](../../supabase/migrations/312_web_security_scope.sql), [313](../../supabase/migrations/313_web_operational_audit_context.sql), [314](../../supabase/migrations/314_account_security_login_organizations.sql) y [315](../../supabase/migrations/315_web_sales_security_compatibility.sql) también fueron aplicadas mediante Supabase MCP. Sus RPC son exclusivas de `service_role`: la comprobación remota confirmó `false` para `EXECUTE` de `anon` y `authenticated`. La revisión remota de alcances de membresía activos pasó de 68 a 67 de 67 tras descartar el registro inactivo.

## Integración Web en curso

La integración implementa servicios y UI para seguridad, auditoría, órdenes de pago y ventas seguras. El inicio de sesión del servidor consulta la política de cuenta; la carga central de empresa y los grants usan el alcance de seguridad Web; y el servidor adjunta cabeceras de auditoría verificadas antes de operaciones mutables. En ventas, la confirmación conserva la compatibilidad del nivel `default` hasta que se configure una categoría restringida y aplica en el servidor las comprobaciones de crédito, reverso y caja/registro de ventas. El despliegue de esta integración sigue en proceso: estas afirmaciones describen el código y las migraciones aplicadas, no un estado `READY` del nuevo despliegue.

## Matriz de seguridad

| ID | Caso | Estado | Evidencia en paquetes y límite actual |
| --- | --- | --- | --- |
| SEG-001 | Crear usuario | Parcial | [`ProvisionOrganizationInvitationIdentity`](../../packages/capabilities/auth/src/application/provision-user.ts) crea una invitación global mediante Supabase Admin, con callback exacto y autorización `members.invite`; el [adaptador organizacional](../../packages/capabilities/organizations/src/adapters/supabase/user-security.ts) crea después la asignación local. 291/293 están desplegadas; falta adoptar el flujo en Web. |
| SEG-002 | Modificar usuario | Parcial | Actualización CAS, prioridad y empresas permitidas persistidas por 291, ya desplegada; falta adoptar el flujo en Web. |
| SEG-003 | Eliminar usuario | Parcial | Revoca sólo la membresía local, sin borrar identidad global compartida; 291 ya lo persiste remotamente; falta consumidor. |
| SEG-004 | Seleccionar usuario | Parcial | Consulta y listado aislados por organización en el adaptador de usuarios; falta adoptar el consumidor. |
| SEG-005 | Cambiar contraseña | Completo (paquetes) | [`ChangePassword`](../../packages/capabilities/auth/src/application/index.ts) usa el adaptador Supabase; 293 registra el cambio de contraseña para el estado de seguridad. |
| SEG-006 | Asignar prioridad a usuario | Parcial | Prioridad administrativa local, acotada a la autoridad, persistida por 291; no es un permiso y falta adopción por un consumidor. |
| SEG-007 | Asignar empresas permitidas | Parcial | 291 guarda la allow-list y `assert_user_security_access` la exige cuando hay configuración; la ausencia conserva acceso legado durante el corte gradual. |
| SEG-008 | Crear mapa de acceso | Completo (paquetes) | [`CreateOrganizationRole`](../../packages/capabilities/access-control/src/application/index.ts) y los RPC de roles existentes. |
| SEG-009 | Modificar mapa de acceso | Completo (paquetes) | [`UpdateOrganizationRole`](../../packages/capabilities/access-control/src/application/index.ts) aplica versión y no permite delegar permisos no poseídos. |
| SEG-010 | Eliminar mapa sin usuarios asociados | Completo (paquetes) | 291 reemplaza `access_control_archive_role` con bloqueo y chequeo de **todas** las membresías, incluidas suspendidas. |
| SEG-011 | Asignar mapa a usuario | Completo (paquetes) | [`AssignMembershipRole`](../../packages/capabilities/access-control/src/application/index.ts) exige organización y capacidad de asignación. |
| SEG-012 | Restringir módulos | Parcial | 291 persiste grants exactos; [`ExecuteAuthorizedOperation`](../../packages/capabilities/access-control/src/application/index.ts) los compone. La integración Web central usa el alcance de seguridad, pero no convierte automáticamente todos los comandos y pantallas en consumidores. |
| SEG-013 | Restringir tablas | Parcial | Grants exactos `table` y wrapper portable; falta adopción por las tablas reales. |
| SEG-014 | Restringir procesos | Parcial | Grants exactos `process` y wrapper portable; falta adopción por procesos existentes. |
| SEG-015 | Restringir reportes | Parcial | Grants exactos `report` y wrapper portable; falta adopción por reportes existentes. |
| SEG-016 | Restringir acciones de barra | Parcial | Grants exactos `toolbar_action` y wrapper portable; falta adopción por UI. |
| SEG-017 | Restringir creación | Parcial | `RequireAuthorization` y el wrapper pueden exigir `*.create`; cada comando debe componerlos. |
| SEG-018 | Restringir modificación | Parcial | El mismo mecanismo cubre `*.update`; no hay instrumentación automática. |
| SEG-019 | Restringir eliminación | Parcial | El mismo mecanismo cubre `*.delete`; no hay instrumentación automática. |
| SEG-020 | Restringir anulación | Parcial | `documents.void` está persistido en 291 y disponible al wrapper; falta adopción por anulaciones existentes. |
| SEG-021 | Restringir impresión | Parcial | `documents.print` está persistido en 291 y disponible al wrapper; falta adopción por generación/descarga real. |
| SEG-022 | Restringir precios disponibles | Parcial | 315 exige permiso y grant `price_list` exacto al confirmar; conserva el nivel `default` heredado hasta que se configure una categoría restringida. Falta verificar el despliegue Web en curso y resolver/validar una lista real en el catálogo. |
| SEG-023 | Restringir stock negativo | Parcial | [`StockPosition.apply`](../../packages/business/inventory/src/domain/stock-position.ts) ya impide negativos; 315 exige la excepción `inventory.negative_stock.use` dentro de la confirmación segura de ventas. Falta verificar el despliegue Web en curso y adoptar los demás flujos de inventario. |
| SEG-024 | Restringir facturación sobregirada | Parcial | [`SecuredSales`](../../packages/business/sales/src/application/secured-sales.ts) y 315 serializan límite, exposición y permiso de excepción al confirmar; la ruta Web está implementada, pero el despliegue sigue en proceso. |
| SEG-025 | Restringir reverso de cobros | Parcial | 294 agrega reverso inmutable, idempotente y autorizado de un pago; 315 conserva esa política en la confirmación de ventas. Falta verificar el despliegue Web en curso y adoptar los consumidores de reverso. |
| SEG-026 | Configurar expiración de contraseña | Parcial | 293 persiste la política organizacional y `SecureSignIn` propaga su `policyVersion` original al CAS bajo bloqueos reales. 312 aplica edad de contraseña para una sesión de credenciales Web. Falta verificar el despliegue Web en curso. |
| SEG-027 | Bloquear por inactividad | Parcial | `SecureSignIn` evalúa la política con CAS; 312 aplica inactividad y lockout a la sesión de credenciales Web. Falta verificar el despliegue Web en curso. |
| SEG-028 | Detectar intentos fallidos/intrusos | Parcial | 293 conserva intentos y bloquea serializadamente; 312 rechaza una sesión Web con lockout vigente. Falta verificar el despliegue Web en curso. |
| SEG-029 | Delegar a Active Directory | Parcial | [`StartFederatedSignIn`](../../packages/capabilities/auth/src/application/account-security.ts) y [`createSupabaseFederatedSignIn`](../../packages/capabilities/auth/src/adapters/supabase/index.ts) inician OAuth Azure Entra ID vía Supabase. Soporta AD federado o sincronizado con Entra, no LDAP/AD directo; falta configurar el proveedor, tenant, secretos y callbacks externos. Consulte la [guía de Azure de Supabase](https://supabase.com/docs/guides/auth/social-login/auth-azure). |

## Matriz de auditoría

| ID | Caso | Estado | Evidencia en paquetes y límite actual |
| --- | --- | --- | --- |
| AUD-001 | Pista al crear | Parcial | 292 instala triggers `AFTER INSERT` sobre las tablas operativas disponibles y está aplicada remotamente; falta instrumentación de consumidores fuera de esas tablas. |
| AUD-002 | Pista al modificar | Parcial | 292 guarda snapshots JSON y `changes` derivados en el mismo statement y está aplicada remotamente; falta instrumentación de consumidores fuera de esas tablas. |
| AUD-003 | Pista al eliminar | Parcial | 292 conserva el snapshot previo en los triggers `AFTER DELETE` y está aplicada remotamente; falta instrumentación de consumidores fuera de esas tablas. |
| AUD-004 | Pista al anular | Parcial | El trigger clasifica como `cancel` un cambio de estado a cancelado/anulado; depende de esas convenciones de estado. |
| AUD-005 | Usuario de la operación | Parcial | 292 almacena `actor_id`; es nulo en operaciones heredadas que no establecen contexto o no tienen `auth.uid()`. |
| AUD-006 | Fecha y hora | Completo (paquetes) | 292 fija `occurred_at` con `clock_timestamp()`, evitando empates de varios cambios dentro de una misma sentencia/transacción. |
| AUD-007 | Sucursal | Parcial | 292 acepta `branch_id` desde el contexto de operación, pero lo permite nulo para compatibilidad heredada. |
| AUD-008 | Equipo de operación | Parcial | 292 acepta `device_id` desde el contexto de operación, pero lo permite nulo para compatibilidad heredada. |
| AUD-009 | Consultar fecha de creación | Parcial | [`GetAuditRecordMetadata`](../../packages/capabilities/audit-trail/src/application/index.ts) y el repositorio RPC pueden resolverla cuando hay hechos persistidos. |
| AUD-010 | Consultar usuario creador | Parcial | La metadata puede resolver `createdBy`, sujeto a que el hecho tenga actor. |
| AUD-011 | Consultar última modificación | Parcial | La metadata puede resolver `lastModifiedAt` desde la pista persistida. |
| AUD-012 | Consultar usuario de última modificación | Parcial | La metadata puede resolver `lastModifiedBy`, sujeto a que el hecho tenga actor. |
| AUD-013 | Consultar lista detallada | Parcial | [`SupabaseAuditTrailRepository`](../../packages/capabilities/audit-trail/src/adapters/supabase/index.ts) llama al RPC con alcance, permiso `audit.read` y paginación; la UI Web de auditoría está integrada, pendiente de verificar su despliegue. |
| AUD-014 | Consultar campos modificados | Parcial | 292 persiste `changes` JSON; omite secretos conocidos de los snapshots. |
| AUD-015 | Consultar información alterada | Parcial | 292 persiste `before_snapshot`/`after_snapshot` JSON, salvo campos sensibles filtrados. |
| AUD-016 | Auditar facturas | Parcial | 292, ya aplicada, instrumenta `shared_inventory_sales_invoices` y `shared_inventory_purchase_invoices` como `invoice`; falta adopción por los consumidores Web. |
| AUD-017 | Auditar órdenes de pago | Implementado (paquetes) | 295 incorpora [`@kontave/payment-orders`](../../packages/business/payment-orders/src/index.ts), su API domain/application/Supabase, tabla `shared_payment_orders`, lectura y CRUD versionados con CAS, parche explícito de `dueDate: null`, `branchId`/`deviceId`, permisos `payment_orders.*` y trigger `payment_order`. 311 añade la consulta paginada exclusiva de servicio para Web. La UI está integrada, pendiente de verificar su despliegue; registra intención administrativa, nunca ejecuta una transferencia. |
| AUD-018 | Auditar clientes | Parcial | 292, ya aplicada, instrumenta `shared_inventory_customers`; falta adopción por los consumidores Web. |
| AUD-019 | Auditar artículos | Parcial | 292, ya aplicada, instrumenta `shared_inventory_products`; falta adopción por los consumidores Web. |
| AUD-020 | Auditar trabajadores | Parcial | 292, ya aplicada, instrumenta `shared_employees`; falta adopción por los consumidores Web. |
| AUD-021 | Auditar recibos de nómina | Parcial | 292, ya aplicada, instrumenta `shared_payroll_receipts`; falta adopción por los consumidores Web. |
| AUD-022 | Auditar comprobantes contables | Parcial | 292, ya aplicada, instrumenta `shared_accounting_entries`; falta adopción por los consumidores Web. |

## Atomicidad y persistencia de auditoría

292 aporta `shared_operational_audit_trail`, un trigger inmutable y un RPC de consulta con `audit.read`. Los triggers corren en la transacción que modifica la fila: un rollback no deja pista. La comprobación remota confirmó tres eventos para insertar, actualizar y eliminar un producto temporal único, y cero eventos al forzar el rollback de una subtransacción; el rollback exterior tampoco dejó datos de negocio. La 309 impide que los roles de cliente y `service_role` ejecuten directamente `append_operational_audit_trigger()`, `operational_audit_snapshot(jsonb)` y `operational_audit_changes(jsonb, jsonb)`; los triggers y rutinas `SECURITY DEFINER` conservan su uso interno. La 313 permite al servidor Web adjuntar actor, tenant, permiso y dispositivo mediante cabeceras verificadas; rechaza un tenant que no coincida antes de registrar el hecho. [`SupabaseAuditTrailRepository`](../../packages/capabilities/audit-trail/src/adapters/supabase/index.ts) sólo consulta esos hechos por RPC; no hace que toda mutación de la aplicación quede instrumentada por sí misma. La pista también incluye el tipo `receivable_payment_reversal`, activado por 294, que no forma parte de los IDs AUD-016..022.

## Migraciones y reproducción de integración

Las migraciones se aplicaron en este orden: 291 (usuarios y grants), 292 (pista operativa), 293 (política y estado de cuentas), 294 (operaciones seguras de ventas), 295 (órdenes de pago) y 309 (privilegios internos de auditoría). Todas son aditivas respecto al esquema esperado; 292 requiere que las siete tablas auditadas ya existan y 295 agrega su tabla después de 292 para adjuntarle el trigger existente. La aplicación remota registrada arriba confirma ese orden para `fvantswxhepvkloygcvc`.

Las pruebas de integración usan PGlite desechable y nunca contactan Supabase. PGlite es una dependencia opcional que no se agrega al lockfile: instale externamente `@electric-sql/pglite` **0.3.14** y señale su `dist/index.js` con `PGLITE_MODULE_PATH` (por ejemplo, `C:\\temp\\kont-pglite\\node_modules\\@electric-sql\\pglite\\dist\\index.js`). Con ese prerequisito, ejecute los archivos `test/integration/*.integration.mjs` de organizaciones, auditoría, ventas y órdenes de pago mediante `node --test`; la prueba de política de cuentas está en `packages/capabilities/auth/test/integration/account-security-policies.integration.test.ts` y se omite si la variable no está definida. Estas pruebas verifican SQL y rollback local, pero no prueban RLS, OAuth ni un proyecto Supabase remoto.

## Integración Web y alcance pendiente

La versión preparada conecta el login con `SecureSignIn`, el desbloqueo, la administración de usuarios y empresas permitidas, los grants específicos, la consulta de auditoría y el CRUD de órdenes de pago. Ventas confirma mediante `SecuredSales`, conserva la caja y expone límites de crédito y reversos en `/settings/security-sales`. Las cuentas por cobrar excluyen abonos revertidos del saldo sin borrar su historial. Los endpoints de empresa del API v1 también comprueban las restricciones de membresía directa, empresa, módulo y datos; la autorización delegada conserva su frontera independiente.

La verificación de grants de la pantalla consulta el acceso del operador actual; la asignación y revocación usan la membresía seleccionada. La lista de precios habitual se identifica como `default`: mantiene el comportamiento previo mientras la categoría no está configurada y exige el grant exacto una vez configurada, incluso si luego se revoca su último grant.

Quedan fuera de este despliegue la configuración de Azure Entra ID, el catálogo/motor de listas de precios y la instrumentación de toda acción local de impresión. Las órdenes registran intención administrativa y no ejecutan transferencias bancarias. La matriz conserva los estados parciales cuando el caso excede estas rutas y adaptadores.

## Evidencia de validación

Las comprobaciones de los seis paquetes pasaron: lint y arquitectura, además del chequeo TypeScript individual de órdenes de pago. La batería suma 157 pruebas: 145 unitarias y 12 PGlite. Por paquete, autenticación ejecutó 33 (32 unitarias y una PGlite), organizaciones 20, control de acceso 21, auditoría 10, ventas 59 y órdenes de pago 4 (tres unitarias y una PGlite); las diez pruebas PGlite adicionales cubren ventas (8), auditoría (1) y organizaciones (1). La última comprobación TypeScript raíz queda pendiente por cambios concurrentes ajenos en `companies` (importación `z` y código de fallo para sucursales); arquitectura pasó. El build raíz tenía como antecedente un `TypeError` sin stack al leer `length` de `undefined` tras un mensaje de Serwist; no se atribuye a estos paquetes.

El script [`test-web-security-sql.mjs`](../../scripts/test-web-security-sql.mjs) pasó contra PGlite local con 311–315. Cubrió paginación y alcance de órdenes de pago, aislamiento de empresa incluso con allow-list configurada vacía, membresía activa, políticas de grants retenidas, edad/inactividad/bloqueo de sesión de credenciales, nivel `default`, stock, crédito y categorías de precio revocadas en ventas, cabeceras de auditoría verificadas y rechazo por tenant no coincidente, recuperación limitada a organizaciones activas y denegación de RPC para `anon`. También pasaron 15 pruebas Web focalizadas. Esta evidencia no convierte el despliegue Web en curso en `READY` ni amplía la cobertura de los 51 casos.

La validación remota del 2026-09-29 verificó RLS en las diez tablas nuevas y ausencia de grants de tabla para `anon` y `authenticated`. También revisó 42 funciones: ninguna permite `EXECUTE` a `anon` ni `authenticated`; entre los 13 triggers relevantes habilitados se incluyen los nueve de auditoría, los de inmutabilidad de auditoría y reversos, el de contraseña de `auth` y el de rol de membresía. El Security Advisor, filtrado a las tablas y funciones de estas migraciones, devolvió sólo diez observaciones informativas `rls_enabled_no_policy`, intencionales por el modelo de RPC exclusivo de servicio; no devolvió advertencias ni errores en ese alcance. Las advertencias preexistentes no relacionadas permanecen fuera de esta revisión. Esta evidencia no añade pruebas unitarias ni completa los casos de consumidor Web, OAuth o Azure Entra.

### Validación del checkout de despliegue

Se validaron TypeScript y pruebas de los seis paquetes integrados en un checkout separado de los cambios concurrentes. Las 16 pruebas focalizadas finales (15 Web y una integración SQL de órdenes de pago) pasaron sin omisiones, además de `test-web-security-sql.mjs`. El lockfile conserva las versiones de producción y sólo agrega los importadores de auditoría y órdenes de pago. La publicación se realiza después del build final y se verifica en Vercel.

Build final Web: `pnpm build` completado correctamente el 2026-09-29 (TypeScript y 249 páginas estáticas). ESLint focal y `git diff --check` también pasaron.
