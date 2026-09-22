# Productos compuestos en inventario y POS

> Estado: implementación en la rama de trabajo, validada localmente. Las migraciones se aplicaron por MCP el 22 de septiembre de 2026 al proyecto Supabase `fvantswxhepvkloygcvc`; esto no publica el código Web ni importa los CSV.

Un producto compuesto es un artículo comercial que conserva una sola línea y un solo precio de venta en el POS, pero cuyo inventario se compone de otros productos. Por ejemplo, un combo puede venderse como una unidad y consumir dos cachitos y una bebida.

## Catálogo y composición

Los productos tienen una presentación explícita: `simple` o `composite`. La clasificación no se infiere por nombre, código ni existencias. La migración de reconciliación reconoce de forma explícita el metadato histórico `custom_fields.tipo_origen` cuando su valor normalizado es `compuesto`; con ello se corrigieron los 38 productos de El Portal que cumplían las condiciones de seguridad.

La reconciliación solo convierte productos simples sin existencias propias y que no sean ya componentes de otra receta. Los productos con existencias distintas de cero o que ya son componentes permanecen sin cambios y requieren revisión manual. Las importaciones ordinarias posteriores del catálogo conservan la presentación compuesta y su receta; solo el reporte de compuestos o el editor manual modifica componentes.

En el formato de catálogo de El Portal, el tipo de origen `Compuesto` crea un producto compuesto y se conserva como `tipo_origen` para trazabilidad. Otros tipos de origen, como `Contorno`, no cambian la presentación a compuesta.

Un compuesto debe tener existencias propias en cero. Sus componentes deben ser productos simples, activos, de la misma empresa y con una unidad de medida compatible con la indicada en el reporte. No se admiten componentes repetidos, cantidades no positivas, autorreferencias ni composiciones anidadas. La composición se puede crear o corregir desde la ficha del producto, en la sección **Composición**.

La composición se guarda por tenant y empresa. Las validaciones de la base de datos impiden que se vinculen productos de otra empresa o tenant.

## Importar el catálogo y el reporte

Hay dos flujos equivalentes:

1. En **Inventario → Importar**, seleccione el catálogo y, opcionalmente, el CSV `Listado de Productos Compuestos`. El catálogo se crea o actualiza primero y el reporte se aplica después.
2. Si el catálogo ya existe, use el bloque **Importar productos compuestos** de la misma pantalla y seleccione solo el reporte complementario.

El reporte se lee como CSV separado por punto y coma. Los códigos se tratan como texto para preservar ceros iniciales y las cantidades aceptan coma decimal, por ejemplo `0,25 kg`. Las filas del mismo compuesto pueden aparecer separadas: se agrupan por su código.

La vista previa valida que todos los productos existan, estén activos, pertenezcan a la empresa actual y que sus unidades coincidan. Si hay errores de formato o de catálogo, la importación del reporte no se inicia. Cada receta incluida reemplaza solo la receta de ese compuesto; no duplica sus componentes ni elimina recetas que no estén presentes en el archivo.

El reporte de `panaderiaypasteleria` analizado contiene 36 productos compuestos y 99 relaciones de componentes. Dos compuestos presentes en el catálogo quedan pendientes hasta que se les configure una receta: `0813 — COMBO 31` y `KHJJKHKKJ — NJKJHHJ`. Un compuesto pendiente no se puede confirmar en una venta.

## Ventas y existencias

El POS carga y muestra la lista de componentes de cada compuesto. Su disponibilidad se calcula con el componente limitante, no con existencias del propio combo. Agregarlo al carrito no cambia existencias.

Al confirmar una factura, la base de datos valida el catálogo y expande los compuestos a sus componentes. La demanda de componentes compartidos entre combos y productos simples se acumula antes de descontar inventario. El descuento ocurre de forma transaccional y respeta la configuración de existencias negativas de la venta.

La línea comercial conserva el precio único del combo. Los movimientos de inventario corresponden a los componentes; el detalle de la receta usada se guarda como una instantánea por línea de factura. Por ello, los reportes de ventas y una desconfirmación usan la venta original aunque más tarde se edite la receta actual.

## Base de datos, despliegue y validación

La migración `264_shared_inventory_composite_products.sql` crea la clasificación, las recetas, sus restricciones y la expansión de ventas. La migración `265_composite_sales_reporting.sql` añade el tratamiento del ingreso comercial de compuestos en los reportes. La migración `266_backfill_imported_composite_products.sql` reconcilia los compuestos históricos identificados por su tipo de origen. Deben aplicarse en este orden: **264**, **265** y **266**; el despliegue de la aplicación que las utiliza ocurre después. Para retirar la funcionalidad se debe hacer una migración explícita de reversión; no se deben borrar tablas o columnas directamente porque las ventas confirmadas conservan instantáneas.

Antes de migrar, ejecutar las pruebas focalizadas desde la raíz del repositorio:

```powershell
node --import tsx --test test/inventory-import.test.ts test/sales-composite-availability.test.ts
npm install --prefix "$env:TEMP/kontave-composite-sql" --no-save --package-lock=false --ignore-scripts @electric-sql/pglite@0.3.14
$env:PGLITE_MODULE_PATH = Join-Path $env:TEMP 'kontave-composite-sql/node_modules/@electric-sql/pglite/dist/index.js'
node scripts/test-composite-products-sql.mjs
pnpm lint
pnpm build
```

La prueba SQL ejecuta las migraciones contra una base aislada usando la función real de movimientos. Cubre validación de recetas, aislamiento por tenant y empresa, límites de unidad y stock, costos de componentes, ingresos sin duplicación, descuento agregado, recetas pendientes o inactivas, cantidades fraccionarias, existencias negativas, confirmación repetida, conservación de la instantánea y desconfirmación después de editar la receta. No simula sesiones PostgreSQL concurrentes; el orden de bloqueo de padres y componentes requiere revisión al modificar estas funciones.

Validación de esta implementación: 16 pruebas de importación/POS aprobadas; prueba SQL, TypeScript, auditoría de rutas y build de producción aprobados. ESLint de los archivos modificados no reportó problemas. El lint global permanece bloqueado por errores preexistentes en archivos fuera de este cambio. Ambos CSV reales se cruzaron sin conflictos: 36 composiciones, 99 relaciones y los dos pendientes indicados arriba.

En Supabase quedaron registradas como `20260922153754_shared_inventory_composite_products` y `20260922153804_composite_sales_reporting`. Se verificaron las dos tablas con RLS habilitado, la clasificación predeterminada, el RPC de reemplazo y el acceso del adaptador servidor a las instantáneas.

La reconciliación de `266_backfill_imported_composite_products.sql` se aplicó de forma remota como `20260922154931_backfill_imported_composite_products`: los 38 productos históricos quedaron clasificados como compuestos. La protección de importación ordinaria se verificó con 18 pruebas de importación/POS, TypeScript, ESLint focalizado y la prueba SQL aprobados. La aplicación Web aún requiere su propio despliegue.
