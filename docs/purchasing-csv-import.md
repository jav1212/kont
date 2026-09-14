# Importación guiada de compras CSV

La ruta [Compras → Importar CSV](<../app/(app)/purchases/import/page.tsx>) importa por defecto un único reporte histórico de compras completas: cada fila contiene la cabecera de la factura y un producto. El sistema agrupa las filas del mismo proveedor y documento en una compra, guarda un lote auditable y solo crea facturas o movimientos de inventario en el último paso.

## Flujo de trabajo

La importación nueva tiene cuatro etapas:

1. **Compras:** seleccione un solo archivo CSV de compras completas y las compras a incluir. Cambiar el archivo inicia otro lote.
2. **Configuración:** resuelva proveedor y productos, y revise IVA y si los costos incluyen IVA. No hay una carga de detalle separada: el mismo archivo ya incluye los productos.
3. **Previsualización:** revise renglones, subtotales, IVA y totales calculados.
4. **Importar:** guarde las compras como borradores o confirme las que estén completas. La confirmación crea las entradas de inventario por las cantidades compradas.

El reporte completo no trae RIF ni número de control del proveedor. El importador busca un proveedor activo cuyo nombre normalizado coincida de forma única; si no hay coincidencia o hay más de una, la compra queda bloqueada hasta escoger un proveedor activo del catálogo. No crea proveedores a partir de este reporte: registre el proveedor en **Proveedores** y vuelva a cargar el archivo cuando aún no exista.

Los productos se buscan por código en la empresa. Una coincidencia activa única se asigna automáticamente; las coincidencias ambiguas o inactivas requieren elección. Un producto faltante puede crearse de forma explícita durante la revisión, como mercancía activa con existencia y costo promedio iniciales en cero, unidad y método de valuación configurados para la empresa (o `unidad` y promedio ponderado). Los precios, IVA de venta y existencias de productos existentes no se modifican.

`IVA`, `IVA1` y cualquier `IVA` seguido solamente por dígitos se interpretan como 16 %; `EXENTO` como 0 %. Las equivalencias ignoran mayúsculas y espacios. Todo otro código de IVA requiere una asignación explícita a exento, 8 % o 16 % antes de continuar. Si el costo declarado incluye IVA, el cálculo obtiene primero el costo neto.

Una nueva carga localiza la compra existente por proveedor resuelto y documento. Si es un borrador, la reemplaza con las filas del reporte incluso si la fecha fue corregida, conserva su identificador y su número de control ya existente. Si está confirmada, la omite como resultado idempotente y no crea movimientos otra vez. Una coincidencia ambigua se bloquea para revisión.

## Formato de compras completas

El archivo debe ser CSV UTF-8 delimitado por `;`, con un máximo de 5 MB y 10.000 filas. Se aceptan BOM, campos entrecomillados, saltos de línea dentro de campos entrecomillados y números venezolanos como `1.234,56`. El reporte puede contener encabezados decorativos, columnas adicionales, líneas vacías y fila de totales: se ignoran. El RIF previo a la cabecera, si está presente, se compara con la empresa activa.

Se requiere una sola aparición de cada una de estas columnas:

| `Departamento` | `Fecha Aplicación` | `Tipo Documento` | `Cantidad` | `Codigo` |
| --- | --- | --- | --- | --- |
| `Detalle` | `IVA Compra` | `Costo Bs.` | `Sub Total Bs.` | `Costo Full Bs.` |
| `Fecha` | `Documento` | `Proveedor` | `Tasa Cambio Bs.` | `S. Total Otra Moneda` |

`Documento`, `Proveedor`, `Codigo` y `Detalle` son obligatorios. Las filas de una misma compra deben tener la misma fecha, tipo de documento y tasa de cambio. Solo se admite `Tipo Documento: Factura`; archivos malformados o datos que no cumplan estas reglas se deben corregir en el origen.

`Sub Total Bs.` es el importe fuente autoritativo en bolívares. Se conserva incluso cuando `Cantidad × Costo Bs.` no coincide por el redondeo del costo unitario que exportó el sistema de origen. `Costo Bs.` se usa para calcular el costo unitario almacenado; las cifras de otra moneda, incluido `S. Total Otra Moneda`, son solo referencia y no reconstruyen los bolívares ni el total fiscal.

Los costos unitarios se almacenan con hasta cuatro decimales, el subtotal fiscal se redondea a céntimos y el IVA agregado se trunca a céntimos. Las tasas admiten hasta cuatro decimales. `Costo Full Bs.` se muestra como referencia y no altera existencia, precios ni IVA de venta.

## Compatibilidad con importaciones anteriores

Los analizadores y contratos de API para el listado de cabeceras y los archivos de detalle anteriores se conservan. La pantalla de una importación nueva no los muestra como pasos separados.

Un borrador antiguo importado sin productos puede completarse desde su factura con `/purchases/import?invoiceId={id}`. Ese flujo dirigido conserva la carga de detalle CSV, asocia cada renglón por `Factura`, `ID Proveedor` y `Fecha`, y limita el guardado y la ejecución a esa única factura. No puede reanudar una factura confirmada ni un borrador que ya contiene productos.

Para los archivos anteriores se mantienen sus columnas requeridas:

| Cabeceras | Detalle |
| --- | --- |
| `Fecha`, `Proveedor`, `RIF`, `Documento`, `Control`, `Referencia`, `ID Pro`, `Moneda`, `Total Bs.`, `Tipo Doc`, `Tasa Cambio Bs.` | `Cantidad`, `Codigo`, `Detalle`, `Costo Bs.`, `Sub Total Bs.`, `Costo Full Bs.`, `Costo *`, `Sub Total *`, `Costo Full *`, `Precio 1`, `Porc 1 %`, `Moneda`, `Cambio`, `IVA Compra`, `Fecha`, `Factura`, `ID Proveedor`, `Existencia`, `IVA Venta` |

En ese formato, los proveedores se resuelven por RIF normalizado, los detalles deben cumplir la asociación anterior y el sistema conserva el total de cabecera como referencia frente al total calculado.

## API y persistencia

Las rutas requieren contexto de tenant y empresa:

- `GET /api/purchases/imports?companyId={id}` lista lotes CSV; requiere `purchases.read`.
- `GET /api/purchases/imports?companyId={id}&invoiceId={idFactura}` recupera el lote proyectado a la factura importada indicada; requiere `purchases.read`.
- `GET /api/purchases/imports/{id}?companyId={id}` recupera un lote; requiere `purchases.read`.
- `POST /api/purchases/imports` guarda una instantánea validada. Acepta `companyId`, `fileName`, `companyRif`, `rows` y `config`; `id` y `revision` son opcionales al crear y obligatorios al actualizar. `targetInvoiceId` restringe el guardado a una factura importada. Requiere `purchases.create` y `inventory.create` cuando se crearán productos.
- `POST /api/purchases/imports/{id}/execute` requiere `companyId`, `mode` (`draft` o `confirm`) y `revision`. `targetInvoiceId` limita la ejecución a una factura. `draft` requiere `purchases.create`; `confirm`, `purchases.confirm`; crear productos también requiere `inventory.create`.

El servidor vuelve a validar empresa, RIF informado, catálogo, IVA, totales y revisión. La ejecución bloquea lote, renglón, proveedor, producto y factura. Una falla en una línea revierte sus creaciones asociadas y deja las demás disponibles para corrección o reintento. Tras una confirmación nueva se intenta la integración contable existente, sin alterar el resultado de la importación.

## Operación y verificación

Además de las migraciones previas [248_shared_purchase_csv_imports.sql](../supabase/migrations/248_shared_purchase_csv_imports.sql) y [250_preserve_purchase_import_line_tenant_on_invoice_delete.sql](../supabase/migrations/250_preserve_purchase_import_line_tenant_on_invoice_delete.sql), el reporte completo requiere [253_purchase_csv_import_draft_resume.sql](../supabase/migrations/253_purchase_csv_import_draft_resume.sql) y [258_complete_purchase_csv_import.sql](../supabase/migrations/258_complete_purchase_csv_import.sql). La 258 hace que el ejecutor resuelva el proveedor del reporte completo por nombre, preserve el control de borradores existentes y trate las confirmadas como inmutables e idempotentes.

El 14 de septiembre de 2026 se aplicaron en Supabase remoto las migraciones 253 (`20260914144744`) y 258 (`20260914144800`). El historial remoto y el hash de la función de la 258 coinciden con la migración local. Las RPC de guardado y ejecución dirigida o reanudable se verificaron como `SECURITY DEFINER`, con `search_path` en `public` y ejecución exclusiva de `service_role`; no se importaron compras, pues el despliegue solo aplicó DDL. No hay rollback de datos automático: antes de retirar la capacidad conserve los lotes y facturas generados y prepare una migración compatible de reversión.

Las pruebas TypeScript focalizadas pasaron, incluido el reporte de muestra `compras completas.csv`: 16 compras y 58 renglones sin errores de análisis. `pnpm build` terminó correctamente y la prueba de renderizado SSR verificó los estados de importación. La comprobación de lint focalizada pasó; el `pnpm lint` completo terminó con 18 errores y 339 advertencias en archivos ajenos a esta capacidad.

El ejecutor SQL de regresión [test-purchase-complete-csv-sql.mjs](../scripts/test-purchase-complete-csv-sql.mjs) pasó en una base PGlite descartable. Carga el recálculo fiscal de producción, las funciones base de importación de la migración 248 y el envoltorio de la migración 258. Verifica creación, persistencia del subtotal con costo unitario redondeado, reemplazo de un borrador existente al conservar identificador y control, omisión inmutable de una confirmada y las protecciones de tenant, proveedor por nombre y factura ambigua.

La confirmación del ejecutor se sustituye por un contador; por ello esta prueba no valida el motor completo de confirmación ni movimientos de inventario. Tampoco valida concurrencia con conexiones múltiples.
