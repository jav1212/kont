# Importación de productos de inventario

La ruta [Inventario → Importar](<../app/(app)/inventory/import/page.tsx>) permite cargar un catálogo desde CSV, XLS o XLSX. El asistente no infiere la moneda de venta a partir de columnas que describen costos: esa decisión se confirma antes de guardar los productos.

## Flujo de importación

El asistente tiene cinco pasos: **Archivo**, **Columnas**, **Precios**, **Configurar** e **Importar**. En **Columnas** se asigna el campo `precio de venta`; en **Precios** se debe elegir si esa columna está expresada en bolívares (VES) o dólares estadounidenses (USD) y si el importe fuente ya incluye IVA. Ambas decisiones se reinician al cargar otro archivo y son obligatorias para continuar. La selección se aplica a todos los precios de venta positivos del archivo.

Para formatos genéricos que incluyen una columna mapeada como `moneda de venta`, también se puede seleccionar **Usar moneda de cada fila**. En ese caso, cada precio toma su moneda de esa columna. Si no se eligió una moneda global ni se mapeó una moneda por fila, no se puede continuar.

El catálogo guarda los precios fijos sin IVA. Si se indica que el precio fuente lo incluye, el importador divide entre 1,16 para productos con IVA general y conserva el importe para productos exentos; el valor neto se guarda con hasta cuatro decimales. La ganancia incluida en el precio final no se recalcula ni se agrega otro margen. La vista previa muestra el importe fuente, neto, IVA y precio final. Las facturas conservan sus reglas de redondeo por línea y conversión monetaria, que pueden producir diferencias de centavos.

Para cada precio positivo se conserva la procedencia en `custom_fields.importacion_precio_venta`: importe fuente, moneda, si incluye IVA e importe neto guardado. Un precio de venta vacío o igual a cero no configura precio, no registra esa procedencia y tampoco reemplaza el precio ya existente de un producto actualizado. La importación conserva el resto de las reglas de actualización del catálogo y de existencias configuradas en el asistente.

## Exportación de El Portal / INVENTARIO3

El perfil reconoce el reporte de El Portal sin encabezados por la disposición de sus columnas, incluso si el archivo se renombró. Para ese diseño, los campos que importan para precios y costos son:

| Columna | Campo fuente | Uso durante la importación |
| --- | --- | --- |
| E | `precio 1` | Precio de venta; su moneda se elige en **Precios**. |
| W | `costo` | Dato de costo de referencia. |
| X | `estanteria` | Se ignora durante esta importación. |
| Y | `moneda` | Moneda del costo de referencia. |

El costo de la columna W y su moneda de la columna Y se almacenan como metadatos de origen (`costo_referencia` y `moneda_costo`). No determinan la moneda del precio de venta, no se convierten a costo promedio y no afectan la valuación de inventario.

Por ejemplo, si E contiene `4,60`, se selecciona USD y se indica que incluye IVA general, se guarda un precio fijo neto de USD 3,9655; al reconstruir el precio final a dos decimales resulta USD 4,60. Si E contiene `3.874,15`, se selecciona VES y se indica que no incluye IVA, se guarda Bs. 3.874,15. Los números venezolanos con punto de miles y coma decimal se interpretan con esa convención.

## Correcciones de moneda e IVA del 14 de septiembre de 2026

Se corrigieron 7.038 productos que coincidían con las importaciones fuente. Los importes de la columna E del archivo original estaban denominados en VES, pero se habían etiquetado indebidamente como USD al tomar la moneda de costo. La primera corrección tomó la columna E del archivo corregido como precio final en USD cuando era positiva:

- 5.994 precios finales positivos de la columna E del archivo corregido quedaron expresados en USD.
- 649 precios finales que el archivo corregido redondeó a `0,00` conservaron el importe pequeño original en VES.
- 395 productos cuyo precio original también era cero permanecieron sin precio de venta configurado.

La segunda corrección interpretó esos importes como precios finales con IVA y guardó el contrato neto vigente: 6.643 precios configurados, de los cuales 5.592 con IVA general se normalizaron dividiendo entre 1,16 y 1.051 exentos se conservaron. Los 395 productos sin precio siguieron sin configurarlo. La primera fila, por ejemplo, pasó de USD 4,60 final a USD 3,9655 neto almacenado.

La revisión comprobó las 7.038 filas sin discrepancias de precio neto y sin discrepancias al reconstruir el precio final a dos decimales. La auditoría conserva el valor previo de cada intervención en `custom_fields.correccion_moneda_venta_20260914` y `custom_fields.correccion_iva_venta_20260914`. La segunda operación actualizó únicamente el precio, sus metadatos y las versiones de los productos.

Los archivos verificados en esa operación fueron `productos.csv` (SHA-256 `27af9390243b8093d2349a36bc7cdcf69d62e4025a7318e5eeaabe52ddb4b01b`) y `productos correccion.csv` (SHA-256 `fa38338bd23e3025c486a46a2e76e204e6f949f3d47eddf5746a627e945d9ec0`).

## Validación

Las diez pruebas focalizadas de importación pasaron. Cubren el perfil de El Portal, la separación entre moneda de venta y moneda de costo, la normalización de IVA general y exento, el uso de moneda por fila en archivos genéricos y la preservación del precio existente ante un cero: [inventory-import.test.ts](../test/inventory-import.test.ts). También verifican la resolución del precio fijo y el total en el motor de facturas. `pnpm build` y `pnpm exec tsc --noEmit` terminaron correctamente.

Ambos CSV de la corrección se analizaron con el perfil actualizado: se leyeron 7.038 filas y se aceptaron 7.030. Ocho filas mantienen conflictos de validación del catálogo, como códigos o IVA inválidos; esa condición no afectó la reparación remota, que se realizó contra las 7.038 identidades ya establecidas.
