# Importación guiada de compras CSV

La ruta [Compras → Importar CSV](<../app/(app)/purchases/import/page.tsx>) permite convertir reportes CSV de compras en facturas de compra y, cuando se confirman, en entradas de inventario. La pantalla siempre inicia vacía y conserva los archivos únicamente durante la importación en curso. Seleccionar un archivo guarda el lote para auditoría sin crear facturas ni movimientos.

## Flujo de trabajo

1. **Compras:** cargue el listado de cabeceras, revise las compras detectadas y seleccione las que se incluirán.
2. **Productos:** adjunte uno o varios archivos de detalle. Un renglón se asocia solamente si coinciden `Factura` con `Documento`, `ID Proveedor` con `ID Pro` y `Fecha`; el nombre del archivo no participa en la asociación.
3. **Configuración:** indique si los costos incluyen IVA. Los códigos `IVA`, `IVA1` y cualquier `IVA` seguido solamente por dígitos se interpretan como 16 %; `EXENTO` se interpreta como 0 %. Estas equivalencias no distinguen mayúsculas de minúsculas ni espacios alrededor del código, se aplican sin una confirmación adicional y no aparecen como selectores. Todo código distinto requiere asignar explícitamente exento, 8 % o 16 % antes de continuar.
4. **Previsualización:** revise los renglones, los totales y los errores pendientes. El importador usa automáticamente el total calculado y conserva el total de cabecera como referencia.
5. **Importar:** **Guardar borradores** persiste las facturas sin confirmar. **Importar y confirmar completas** confirma las compras completas y aumenta el inventario por la cantidad comprada. Las cabeceras sin detalle se conservan como borradores para completar después.

Al continuar desde configuración, el asistente guarda automáticamente las coincidencias únicas activas: productos por código y proveedores por RIF normalizado. Las coincidencias múltiples, inactivas o faltantes no se vinculan de forma automática; el usuario debe seleccionar una coincidencia o crear explícitamente el producto necesario. Para compras no confirmadas, el total calculado queda aceptado automáticamente al crear o modificar el lote, incluidos cambios de costos o IVA; el total de cabecera se conserva en la auditoría como referencia. Las compras confirmadas conservan su resultado y no se ejecutan otra vez. Guardar una modificación incrementa su revisión; al ejecutar se debe usar la revisión que se mostró en la previsualización. Esto evita ejecutar una versión desactualizada del lote.

## Formato admitido

Los reportes deben ser CSV UTF-8 delimitados por `;`. Se aceptan BOM, campos entrecomillados, saltos de línea dentro de un campo entrecomillado y números venezolanos (`1.234,56`). El archivo tiene un máximo de 5 MB y 10.000 filas; la solicitud procesada tiene un máximo de 10 MB y 10.000 detalles.

El importador ignora adornos del reporte, columnas no seleccionadas, líneas vacías y la fila de totales. Requiere una sola aparición de cada columna siguiente:

| Archivo de cabeceras | Archivo de detalle |
| --- | --- |
| `Fecha`, `Proveedor`, `RIF`, `Documento`, `Control`, `Referencia`, `ID Pro`, `Moneda`, `Total Bs.`, `Tipo Doc`, `Tasa Cambio Bs.` | `Cantidad`, `Codigo`, `Detalle`, `Costo Bs.`, `Sub Total Bs.`, `Costo Full Bs.`, `Costo *`, `Sub Total *`, `Costo Full *`, `Precio 1`, `Porc 1 %`, `Moneda`, `Cambio`, `IVA Compra`, `Fecha`, `Factura`, `ID Proveedor`, `Existencia`, `IVA Venta` |

El RIF que el reporte presenta antes de la cabecera se usa para comprobar la empresa activa. Los importes se mantienen como texto decimal exacto; los códigos, números de documento, controles e identificadores externos se mantienen como texto, incluso si contienen ceros iniciales. Solo se admite `Tipo Doc: Factura`; otros documentos y archivos malformados bloquean la importación y deben corregirse en el origen.

## Cálculo, catálogos y persistencia

`Costo Bs.` y `Sub Total Bs.` son la base operativa. El detalle debe cumplir `Cantidad × Costo Bs. = Sub Total Bs.` al redondear a céntimos. La importación usa los valores de origen en bolívares como base canónica (`source_bs`), aun con líneas USD; no reconstruye los Bs. desde los importes en moneda extranjera. Los costos unitarios se almacenan con hasta cuatro decimales, el subtotal fiscal se redondea a céntimos y el IVA agregado se trunca a céntimos. Las tasas admiten hasta cuatro decimales y se conservan con esa precisión.

Si el costo declarado incluye IVA, el asistente obtiene el costo neto antes de calcular impuesto. `Costo Full`, las columnas con `*`, `Precio 1`, `Porc 1 %`, `Existencia` e `IVA Venta` quedan como datos de referencia. No modifican la existencia, los precios ni el IVA de venta de productos existentes.

Los proveedores se resuelven por RIF normalizado y los productos por código dentro de la empresa activa. Solo una coincidencia activa se vincula automáticamente; las coincidencias ambiguas o inactivas requieren selección. Al faltar un proveedor se crea al ejecutar; al faltar un producto se puede crear después de revisarlo, como mercancía activa con existencia y costo promedio iniciales en cero, unidad y método de valuación configurados para la empresa (o `unidad` y promedio ponderado), e IVA de venta revisable. El precio de venta es opcional para un producto nuevo.

El catálogo actual distingue IVA de venta general y exento. Crear un producto con equivalencia de IVA de venta 8 % queda bloqueado para evitar convertirlo silenciosamente a general; puede vincularse un producto existente. Los detalles pendientes pueden quitarse desde el segundo paso para reemplazar un archivo antes de confirmar.

Los lotes y renglones guardan las cabeceras, detalles, configuración, cálculo y resultado de ejecución como registro de auditoría. La ejecución bloquea el lote, renglón, proveedor, producto y factura involucrados; un reintento de una factura ya confirmada devuelve el resultado existente y no duplica la factura ni los movimientos de inventario. Una falla de una línea revierte sus creaciones asociadas y deja el resto del lote disponible para corregir o reintentar.

## API y permisos

Las rutas requieren contexto de tenant y empresa:

- `GET /api/purchases/imports?companyId={id}` lista lotes CSV de la empresa; requiere `purchases.read`.
- `GET /api/purchases/imports/{id}?companyId={id}` recupera un lote; requiere `purchases.read`.
- `POST /api/purchases/imports` guarda una instantánea validada. El cuerpo contiene `companyId`, `fileName`, `companyRif`, `rows` y `config`; `id` y `revision` son opcionales al crear y obligatorios para actualizar un lote existente. Requiere `purchases.create` y, si se crearán productos, `inventory.create`.
- `POST /api/purchases/imports/{id}/execute` requiere exactamente `{ "companyId": "…", "mode": "draft" | "confirm", "revision": n }`. `draft` requiere `purchases.create`; `confirm` requiere `purchases.confirm`; crear productos también requiere `inventory.create`.

La ejecución vuelve a validar empresa, RIF, asociación, catálogo, IVA, totales, diferencias y revisión del lote en servidor. Tras una confirmación nueva se intenta la integración contable existente; su resultado no bloquea ni modifica el resultado ya devuelto por la importación.

## Operación y verificación

La migración [248_shared_purchase_csv_imports.sql](../supabase/migrations/248_shared_purchase_csv_imports.sql) añade los campos de auditoría CSV, revisión y base de cálculo `source_bs` a las tablas de importación y facturas existentes. La evidencia de despliegue de esta entrega confirma que fue aplicada en Supabase remoto. La migración [250_preserve_purchase_import_line_tenant_on_invoice_delete.sql](../supabase/migrations/250_preserve_purchase_import_line_tenant_on_invoice_delete.sql) es obligatoria para instalaciones con esta capacidad: al eliminar una factura importada enlazada, conserva el renglón de importación, su tenant, lote y datos de origen, y deja `invoice_id` vacío. La clave foránea conserva `(tenant_id, invoice_id)` y aplica `ON DELETE SET NULL (invoice_id)`; la corrección se verificó en PostgreSQL 17. La aceptación automática del total calculado y las equivalencias de IVA se aplican sobre lotes existentes, por lo que este ajuste no requiere una nueva migración. No hay un rollback de datos automático: para retirar la capacidad, primero conserve los lotes y facturas generados y evalúe una migración de reversión compatible.

La cobertura focalizada se ejecuta con los tests de dominio y casos de uso de compras, además de la prueba SQL transaccional:

```bash
node --import tsx --test src/modules/purchases/backend/domain/purchase-csv-import.test.ts
node --import tsx --test src/modules/purchases/backend/app/purchase-csv-import.use-cases.test.ts
psql "$DATABASE_URL" -f test/purchase-csv-import.sql
pnpm lint
pnpm build
```

La prueba SQL termina con `ROLLBACK`: valida idempotencia, aislamiento por tenant y empresa, cálculo fiscal y reversión de una ejecución fallida sin conservar sus fixtures. La revisión visual del asistente en navegador no forma parte de esta evidencia porque no hubo navegador disponible. El lint completo conserva errores preexistentes de la línea base; use los resultados focalizados y la compilación para evaluar cambios de esta capacidad.
