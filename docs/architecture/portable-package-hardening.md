# Endurecimiento de paquetes portables

Este documento describe las garantías implementadas alrededor de los paquetes
portables. Complementa [ADR 0002](../adr/0002-hexagonal-ddd.md),
[ADR 0035](../adr/0035-bounded-context-package-granularity.md) y
[ADR 0032](../adr/0032-inventory-flow-views-and-auditable-operations.md).

## Fronteras y contratos

El chequeo de arquitectura analiza el AST y rechaza dependencias que invierten
las capas, ciclos entre paquetes, imports de rutas privadas y exports portables
que alcancen infraestructura, frameworks o plataforma. Incluye imports y
reexports estáticos, `import()`/`require()` literales e imports de tipo. Los
adaptadores, composición y renderers conservan sus límites explícitos descritos
en el [estándar de arquitectura](../standards/architecture.md).

`@kontave/client-remote` conserva las interfaces públicas `RemoteTransport` y
`KontaveRemoteClient`. Cada adaptador de capacidad decodifica su DTO completo
sin coerción antes de exponerlo; los campos adicionales del servidor se
preservan para compatibilidad aditiva. Un DTO inválido produce
`KontaveRemoteFailure` con código `INVALID_RESPONSE`. Para el transporte
incorporado se conserva el `requestId` de una envoltura válida, incluso si el
DTO de datos no lo es; los transportes personalizados se validan sin inventar
metadatos. La correlación interna usa un `WeakMap` y no amplía la API pública.

## Inventario y persistencia

El dominio de `@kontave/inventory` modela reglas puras. Las operaciones contra
Supabase usan las RPC de las migraciones
[`236`](../../supabase/migrations/236_native_inventory_operations.sql) y
[`245`](../../supabase/migrations/245_native_inventory_operation_metadata.sql),
que son la autoridad vigente para aislamiento de tenant, concurrencia
optimista, estado persistido y transacciones. La migración 245 limita los
cambios a metadatos de un borrador; la 236 bloquea la fila para postear o
revertir y crea o revierte sus movimientos dentro de la operación SQL.

Las pruebas unitarias y de adaptador cubren las reglas puras, la traducción de
parámetros RPC, el alcance por actor/organización/empresa, versiones y rechazo
de respuestas RPC malformadas. No equivalen a una comprobación contra
PostgreSQL real.

La suite de integración está en
[`packages/business/inventory/test/integration/inventory-operations.integration.mjs`](../../packages/business/inventory/test/integration/inventory-operations.integration.mjs).
Se ejecuta con:

```bash
KONTAVE_INTEGRATION_ALLOW_DB=true \
KONTAVE_INTEGRATION_DATABASE_URL='postgres://…/kontave_test' \
KONTAVE_INTEGRATION_ACTOR_USER_ID='…' \
KONTAVE_INTEGRATION_ORGANIZATION_ID='…' \
KONTAVE_INTEGRATION_FOREIGN_ORGANIZATION_ID='…' \
KONTAVE_INTEGRATION_COMPANY_ID='…' \
KONTAVE_INTEGRATION_FOREIGN_COMPANY_ID='…' \
KONTAVE_INTEGRATION_PRODUCT_ID='…' \
KONTAVE_INTEGRATION_PRODUCT_UNIT='each' \
pnpm --filter @kontave/inventory test:integration
```

La suite rechaza una URL que no sea loopback o cuya base no incluya `test`.
Requiere una base desechable ya migrada y fixtures aisladas: un actor autorizado,
organización y empresa, otra organización y empresa sin acceso, y un producto
activo de esa empresa. Crea filas efímeras y las elimina al terminar. Comprueba
alcance entre tenants, conflicto de versión concurrente y rollback de una
creación con una línea inválida. Hasta que se ejecute contra esa base, esos tres
comportamientos siguen sin evidencia de integración en este repositorio.

Purchasing y Sales expresan la confirmación atómica de sus agregados junto con
un evento idempotente, y sus adaptadores traducen el evento hacia Inventory. No
existe aún un adaptador persistente para `PurchasingCommitPort` o
`SalesCommitPort`, ni un outbox que publique y reintente esos eventos. Por ello
la durabilidad entre esos contextos es trabajo pendiente, no una garantía de
producción.

## Lint portable

La configuración de ESLint mantiene las reglas de Next.js en la Web de raíz.
Para `apps/`, `packages/` y `tooling/` desactiva sólo las reglas
`@next/next/*`; las reglas comunes de React y TypeScript permanecen activas.
