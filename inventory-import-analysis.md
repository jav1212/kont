# Revisión de inventario antes de importar

Fuente: invenatario ii.csv

El archivo no debe cargarse directamente. Este informe no realiza ninguna carga.

| Indicador | Resultado |
|---|---:|
| Filas de productos | 1341 |
| Códigos únicos | 1212 |
| Grupos de códigos duplicados | 118 |
| Filas dentro de duplicados | 247 |
| Existencia positiva | 537 |
| Existencia en cero | 506 |
| Existencia negativa | 298 |
| Precio 1 válido | 1295 |
| Precio 1 vacío/cero | 46 |
| Moneda EUR | 1 |
| Departamento vacío | 22 |
| Productos compuestos | 37 |

## Mapeo propuesto

| Campo fuente | Campo KONT | Tratamiento |
|---|---|---|
| codigo | product.code | transformar: Debe quedar único; hay duplicados. |
| descripcion | product.name | directo: Usar como nombre. |
| departamento | department.name | transformar: Coincidir o crear departamentos. |
| existencia | movement.initialStock | transformar: Revisar negativas y convertir a ajuste inicial. |
| precio  1 | product.salePricing | transformar: Precio de venta fijo; USD→D y Bs.→B. |
| precio  2/3/4 | sin_mapeo | ignorar: Todos están en cero. |
| IVA1 | product.vatType | transformar: IVA1→general; EXENTO→exento. |
| medidas | product.measureUnit | transformar: UNI→unidad; KG→kg; GR→g. |
| producto | product.type | transformar: Producto→mercancia; Compuesto requiere decisión. |
| moneda | product.salePricing.currency | transformar: EUR no es compatible. |
| (ausente) | product.averageCost | faltante: No hay costo de compra/promedio. |
| (ausente) | product.valuationMethod | faltante: Elegir promedio_ponderado o peps. |

## Distribuciones

### Monedas
- Bs.: 174
- EUR €: 1
- USD $: 1166

### Unidades
- GR: 2
- KG: 190
- UNI: 1149

### Departamentos
- (vacío): 22
- 10601-FABRICACION DE PRODUCTOS DE PANADERIA: 186
- 50001-DETAL DE SUPERMERCADO Y AUTOMERCADO: 1077
- 50005-DETAL DE BEBIDAS NO ALCOLICAS: 4
- 50006-DETAL DE HIELO: 1
- 50007-DETAL DE CIGARRILLOS , TABACO, PICADURA: 3
- 50008-DETAL DE BOMBONES, CARAMELOS, CONFITERIA: 4
- 50076-OTRO TIPO DE COMERCIO AL DETAL NO ESPECIFICADO , KINCALLA: 44

### IVA
- IVA1: 1125
- EXENTO: 216

## Archivos

- inventory-import-review.csv: conflictos por producto.
- inventory-import-mapping.csv: mapeo de campos y transformaciones.
