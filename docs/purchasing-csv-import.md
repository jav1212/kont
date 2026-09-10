# Importación guiada de compras CSV

La ruta [Compras → Importar CSV](<../app/(app)/purchases/import/page.tsx>) permite convertir reportes CSV de compras en facturas de compra y, cuando se confirman, en entradas de inventario. La pantalla inicia un lote nuevo salvo que se abra con `/purchases/import?invoiceId={id}`. Esta segunda ruta reanuda exclusivamente un borrador importado sin productos para cargar su detalle CSV. Seleccionar un archivo guarda el lote para auditoría sin crear facturas ni movimientos.

## Flujo de trabajo

1. **Compras:** cargue el listado de cabeceras, revise las compras detectadas y seleccione las que se incluirán.
2. **Productos:** adjunte uno o varios archivos de detalle. Un renglón se asocia solamente si coinciden `Factura` con `Documento`, `ID Proveedor` con `ID Pro` y `Fecha`; el nombre del archivo no participa en la asociación.
3. **Configuración:** indique si los costos incluyen IVA. Los códigos `IVA`, `IVA1` y cualquier `IVA` seguido solamente por dígitos se interpretan como 16 %; `EXENTO` se interpreta como 0 %. Estas equivalencias no distinguen mayúsculas de minúsculas ni espacios alrededor del código, se aplican sin una confirmación adicional y no aparecen como selectores. Todo código distinto requiere asignar explícitamente exento, 8 % o 16 % antes de continuar.
4. **Previsualización:** revise los renglones, los totales y los errores pendientes. El importador usa automáticamente el total calculado y conserva el total de cabecera como referencia.
5. **Importar:** **Guardar borradores** persiste las facturas sin confirmar. **Importar y confirmar completas** confirma las compras completas y aumenta el inventario por la cantidad comprada. Las cabeceras sin detalle se conservan como borradores para completar después.

Para completar una cabecera que quedó sin productos, abra su factura en borrador y seleccione la acción para importar productos. El enlace abre `/purchases/import?invoiceId={id}` directamente en el paso **Productos**. Allí se adjunta el CSV de detalle, se resuelven los productos y el IVA, y se revisan el total de cabecera, el total calculado y su diferencia antes de guardar o confirmar. La operación actualiza y, al confirmar, conserva el mismo identificador de factura; no procesa las demás filas del lote original. Conserva el período, tasa, precisión y notas ajustadas manualmente en el borrador.

Solo puede reanudarse un borrador creado por el importador que no tenga productos. El servidor comprueba el vínculo con la fila de origen, la empresa, la revisión y que la identidad de la factura (proveedor, documento, control, fecha y moneda) no haya cambiado. Una factura confirmada o un borrador con productos no se puede completar mediante este flujo.

Al continuar desde configuración, el asistente guarda automáticamente las coincidencias únicas activas: productos por código y proveedores por RIF normalizado. Las coincidencias múltiples, inactivas o faltantes no se vinculan de forma automática; el usuario debe seleccionar una coincidencia o crear explícitamente el producto necesario. Para compras no confirmadas, el total calculado queda aceptado automáticamente al crear o modificar el lote, incluidos cambios de costos o IVA; el total de cabecera se conserva en la auditoría como referencia. Las compras confirmadas conservan su resultado y no se ejecutan otra vez. Guardar una modificación incrementa su revisión; al ejecutar se debe usar la revisión que se mostró en la previsualización. Esto evita ejecutar una versión desactualizada del lote.

Volver a importar cabeceras no crea una segunda factura ni bloquea el lote cuando encuentra una factura con la misma identidad de proveedor, documento y control. Si la factura existente sigue en borrador, la fila queda vinculada a ella y puede actualizarse; una importación que contiene solo cabeceras conserva los productos y los totales que ya tenía ese borrador. Si ya está confirmada, se omite y se informa como resultado idempotente, sin volver a crear movimientos de inventario. La configuración de IVA revisada al completar una factura se guarda en su propia fila y no reemplaza la configuración de otras compras del lote; un guardado normal del lote conserva esas configuraciones por fila.

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
- `GET /api/purchases/imports?companyId={id}&invoiceId={idFactura}` recupera el lote proyectado a la única fila vinculada con esa factura; requiere `purchases.read`.
- `GET /api/purchases/imports/{id}?companyId={id}` recupera un lote; requiere `purchases.read`.
- `POST /api/purchases/imports` guarda una instantánea validada. El cuerpo contiene `companyId`, `fileName`, `companyRif`, `rows` y `config`; `id` y `revision` son opcionales al crear y obligatorios para actualizar un lote existente. `targetInvoiceId` es opcional y, cuando está presente, exige exactamente una fila y restringe el guardado a esa factura importada. Requiere `purchases.create` y, si se crearán productos, `inventory.create`.
- `POST /api/purchases/imports/{id}/execute` requiere `companyId`, `mode` (`draft` o `confirm`) y `revision`. `targetInvoiceId` es opcional y limita la ejecución a una sola fila del mismo lote y revisión. `draft` requiere `purchases.create`; `confirm` requiere `purchases.confirm`; crear productos también requiere `inventory.create`.

La ejecución vuelve a validar empresa, RIF, asociación, catálogo, IVA, totales, diferencias y revisión del lote en servidor. Tras una confirmación nueva se intenta la integración contable existente; su resultado no bloquea ni modifica el resultado ya devuelto por la importación.

## Operación y verificación

La migración [248_shared_purchase_csv_imports.sql](../supabase/migrations/248_shared_purchase_csv_imports.sql) añade los campos de auditoría CSV, revisión y base de cálculo `source_bs` a las tablas de importación y facturas existentes. La migración [250_preserve_purchase_import_line_tenant_on_invoice_delete.sql](../supabase/migrations/250_preserve_purchase_import_line_tenant_on_invoice_delete.sql) es obligatoria para instalaciones con esta capacidad: al eliminar una factura importada enlazada, conserva el renglón de importación, su tenant, lote y datos de origen, y deja `invoice_id` vacío. La clave foránea conserva `(tenant_id, invoice_id)` y aplica `ON DELETE SET NULL (invoice_id)`.

La migración [253_purchase_csv_import_draft_resume.sql](../supabase/migrations/253_purchase_csv_import_draft_resume.sql) es obligatoria para reanudar borradores, restringir el guardado y la ejecución a una factura importada y hacer idempotente la reimportación de cabeceras. No se aplicó en Supabase remoto durante esta sesión; debe aplicarse antes de habilitar estas rutas en un entorno compartido. No hay un rollback de datos automático: para retirar la capacidad, primero conserve los lotes y facturas generados y evalúe una migración de reversión compatible.

La cobertura focalizada se ejecuta con los tests de dominio y casos de uso de compras, además de la prueba SQL transaccional:

```bash
node --import tsx --test src/modules/purchases/backend/domain/purchase-csv-import.test.ts
node --import tsx --test src/modules/purchases/backend/app/purchase-csv-import.use-cases.test.ts
node --import tsx --test src/modules/purchases/backend/infra/repository/shared-purchase-csv-import.repository.test.ts
psql "$DATABASE_URL" -f test/purchase-csv-import.sql
psql "$DATABASE_URL" -f test/purchase-csv-import-draft-resume.sql
pnpm lint
pnpm build
```

Las pruebas SQL terminan con `ROLLBACK`: validan idempotencia, aislamiento por tenant y empresa, cálculo fiscal y reversión de una ejecución fallida sin conservar sus fixtures. La prueba de reanudación añade aislamiento entre filas, conservación de IVA y datos manuales del borrador, rechazo de revisiones antiguas y preservación de productos y movimientos al reimportar. No se ejecutaron pruebas SQL contra PostgreSQL local ni remoto en esta sesión. El lint completo conserva errores preexistentes de la línea base; use los resultados focalizados y la compilación para evaluar cambios de esta capacidad.
