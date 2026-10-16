# Catálogo de productos

Este paquete contiene reglas portables para el catálogo de productos. Sus adaptadores Supabase se componen en un límite de servidor de confianza; el paquete no publica rutas HTTP ni pantallas.

## Importación de maestros entre empresas (ADM-005)

`PreviewProductCatalogImport` revisa una selección explícita de categorías y productos de una empresa origen frente a otra empresa de la misma organización. La vista previa no escribe datos: devuelve conflictos y tokens opacos que fijan las filas fuente seleccionadas y las claves relevantes del destino. `ExecuteProductCatalogImport` exige esos dos tokens, una clave de idempotencia y autorización independiente para leer el origen (`inventory.read`) y escribir el destino (`inventory.update`).

La selección admite como máximo 100 registros en total y una política de conflictos `fail` o `skip`. Con `fail`, cualquier conflicto detiene la operación; con `skip`, se omiten los maestros en conflicto y los productos cuya categoría seleccionada no pueda crearse. Un reintento idéntico devuelve el recibo persistido; reutilizar la clave para otra intención falla.

Los fallos esperados de la operación forman parte de los contratos cliente de `@kontave/client-contracts`, para que un consumidor pueda distinguir una vista previa obsoleta, un conflicto de catálogo o una reutilización incompatible de la clave de idempotencia.

El adaptador Supabase usa las RPC de [`326_product_catalog_import.sql`](../../../supabase/migrations/326_product_catalog_import.sql), corregidas por [`327_product_catalog_import_conflict_dedup.sql`](../../../supabase/migrations/327_product_catalog_import_conflict_dedup.sql). Las funciones son exclusivas de `service_role`, verifican ambas autorizaciones y vuelven a validar los tokens dentro de una transacción. Para coexistir con escritores heredados, la ejecución espera hasta cinco segundos para obtener bloqueos de escritura sobre las tablas de catálogo y los mantiene hasta el fin de la transacción. Las solicitudes y eventos quedan en tablas privadas con RLS.

La importación crea únicamente categorías y productos maestros compatibles con nuevas identidades de destino. Conserva el origen y no copia existencias, costos, movimientos, precios, impuestos, composición, campos personalizados ni IDs históricos. El preflight y el smoke reversibles viven en [`supabase/checks`](../../../supabase/checks); la evidencia de desarrollo y las limitaciones de producto están en la [matriz ADM](../../../docs/audit/profitplus-administracion-packages-2026-09-28.md). No hay todavía un consumidor Web.
