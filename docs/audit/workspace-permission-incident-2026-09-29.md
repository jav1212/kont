# Incidente de acceso a espacios de trabajo — 2026-09-29

## Resumen

El 2026-09-29 todos los inicios de sesión afectados fallaron al cargar el espacio de trabajo. La causa confirmada fue una incompatibilidad entre permisos persistidos aditivos y un consumidor de autorización que exigía que cada `permission_code` perteneciera a su catálogo local. Las migraciones [291](../../supabase/migrations/291_user_security_access.sql), [292](../../supabase/migrations/292_operational_audit_trail.sql) y [295](../../supabase/migrations/295_payment_orders_audit.sql) habían agregado permisos a la base de datos; el cliente de producción en el commit `52b3e88` todavía no reconocía todos ellos.

Al materializar el rol de una membresía, `mapRole` invocaba `permissionCode` para cada grant. Un permiso nuevo producía `TypeError`, el fallo se transformaba en ausencia de autorización y `requireTenant` respondía `403`. El manejo amplio de errores de membresía lo presentó además como `401`. La ruta `organization-access` mostró respuestas `401` repetidas en la investigación, pero esa sonda fue un hallazgo separado y no la causa del fallo de arranque del espacio de trabajo.

La [matriz de seguridad y auditoría](profitplus-seguridad-auditoria-packages-2026-09-28.md) conserva el alcance y la evidencia de las migraciones que introdujeron esos permisos.

## Alcance e impacto confirmado

- Alcance: carga del espacio de trabajo después del inicio de sesión.
- Impacto: los usuarios afectados no podían completar la entrada al espacio de trabajo.
- Datos: no se revirtieron ni modificaron las migraciones de seguridad y auditoría aplicadas en la base de datos.
- Fuera del alcance: Azure Entra ID no participó en este incidente; la integración de seguridad de la Web permanecía sin terminar cuando se priorizó la mitigación.

## Corrección

El hotfix `38e94514e90f6e0f2e4695c983c3200bd8c73be1` (`fix(auth): tolerate future persisted permissions during workspace bootstrap`) se preparó desde el estado de producción y se publicó junto con `b1d87168133361987b12b72faf17a6b1915431a5`.

La corrección agrega `knownPermissionCodes` y hace que la lectura de roles y del catálogo administrativo ignore permisos persistidos que ese cliente aún no entiende. No convierte permisos desconocidos en acceso y no expande el grant persistido `*` al catálogo local durante el arranque. Por tanto, un consumidor anterior puede seguir autorizando únicamente permisos explícitos que conoce, mientras que un permiso agregado por una migración ya no impide resolver la membresía.

## Validación disponible

En el checkout aislado del hotfix se reprodujo el `TypeError` en las dos rutas de materialización relevantes antes del cambio. Después del cambio aprobaron 15 de 15 pruebas de `access-control` y el chequeo TypeScript. Dos regresiones cubren tanto un snapshot de autorización con permisos futuros y `*` como el listado administrativo del catálogo con un permiso futuro.

La evidencia corresponde al checkout aislado. El worktree principal contenía cambios concurrentes más amplios y no se usa como evidencia de esa validación.

## Despliegue y estado operativo

El despliegue de producción `dpl_9eatUZCTt3Nr5bB3dK5Zyq1WpywG` quedó en estado `READY`. El usuario confirmó que el acceso al espacio de trabajo se restableció. Con esa confirmación, el incidente queda resuelto; no implica que el despliegue separado de la integración Web de seguridad y auditoría esté listo.

## Lecciones y seguimiento

La hipótesis inicial atribuyó el problema a las respuestas `401` de `organization-access`. La reproducción corrigió ese diagnóstico: el bloqueo de arranque fue la decodificación estricta de grants persistidos durante la autorización de tenant; la sonda de `organization-access` requiere seguimiento independiente.

Las migraciones que conceden permisos nuevos deben desplegarse con un consumidor que tolere grants aditivos desconocidos, o después de verificar que el consumidor ya lo hace. Esa compatibilidad debe preservarse sin otorgar permisos no entendidos ni interpretar comodines persistidos como acceso total. Para cambios futuros, validar una cuenta con un rol que contenga un permiso recién agregado antes de promover el rollout.

## Rollback

No se requiere rollback de base de datos para este incidente. Si el hotfix de consumidor necesitara reversión, los grants nuevos pueden permanecer almacenados: los consumidores compatibles los ignoran hasta soportarlos. Cualquier reversión o nueva promoción debe incluir la misma comprobación autenticada del arranque del espacio de trabajo.
