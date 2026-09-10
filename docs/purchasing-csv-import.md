# Importación guiada de compras CSV

La ruta [Compras → Importar CSV](<../app/(app)/purchases/import/page.tsx>) permite convertir reportes CSV de compras en facturas de compra y, cuando se confirman, en entradas de inventario. El asistente guarda lotes por empresa para continuar un trabajo pendiente; seleccionar un archivo guarda el lote sin crear facturas ni movimientos.

## Flujo de trabajo

1. **Compras:** cargue el listado de cabeceras, revise las compras detectadas y seleccione las que se incluirán.
2. **Productos:** adjunte uno o varios archivos de detalle. Un renglón se asocia solamente si coinciden `Factura` con `Documento`, `ID Proveedor` con `ID Pro` y `Fecha`; el nombre del archivo no participa en la asociación.
3. **Configuración:** indique si los costos incluyen IVA y asigne cada código de IVA de compra y de venta a exento, 8 % o 16 %. El asistente propone `IVA1` como 16 % y `EXENTO` como exento, pero la configuración debe marcarse como revisada.
4. **Previsualización:** revise los renglones, los totales y los errores pendientes, y acepte explícitamente cada diferencia entre el total calculado y el total de cabecera antes de confirmar.
5. **Importar:** **Guardar borradores** persiste las facturas sin confirmar. **Importar y confirmar completas** confirma las compras completas y aumenta el inventario por la cantidad comprada. Las cabeceras sin detalle se conservan como borradores para completar después.

Los lotes pendientes pueden reabrirse desde la misma pantalla. Guardar una modificación incrementa su revisión; al ejecutar se debe usar la revisión que se mostró en la previsualización. Esto evita ejecutar una versión desactualizada del lote.

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

Los proveedores se resuelven por RIF normalizado y los productos por código dentro de la empresa activa. Las coincidencias ambiguas requieren selección. Al faltar un proveedor se crea al ejecutar; al faltar un producto se puede crear después de revisarlo, como mercancía activa con existencia y costo promedio iniciales en cero, unidad y método de valuación configurados para la empresa (o `unidad` y promedio ponderado), e IVA de venta revisable. El precio de venta es opcional para un producto nuevo.

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

La migración [248_shared_purchase_csv_imports.sql](../supabase/migrations/248_shared_purchase_csv_imports.sql) añade los campos de auditoría CSV, revisión y base de cálculo `source_bs` a las tablas de importación y facturas existentes. La evidencia de despliegue de esta entrega confirma que fue aplicada en Supabase remoto. No hay un rollback de datos automático: para retirar la capacidad, primero conserve los lotes y facturas generados y evalúe una migración de reversión compatible.

La cobertura focalizada se ejecuta con los tests de dominio y casos de uso de compras, además de la prueba SQL transaccional:

```bash
node --import tsx --test src/modules/purchases/backend/domain/purchase-csv-import.test.ts
node --import tsx --test src/modules/purchases/backend/app/purchase-csv-import.use-cases.test.ts
psql "$DATABASE_URL" -f test/purchase-csv-import.sql
pnpm lint
pnpm build
```

La prueba SQL termina con `ROLLBACK`: valida idempotencia, aislamiento por tenant y empresa, cálculo fiscal y reversión de una ejecución fallida sin conservar sus fixtures. La revisión visual del asistente en navegador no forma parte de esta evidencia porque no hubo navegador disponible. El lint completo conserva errores preexistentes de la línea base; use los resultados focalizados y la compilación para evaluar cambios de esta capacidad.
