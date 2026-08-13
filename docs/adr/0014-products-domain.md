# ADR 0014: Productos como capacidad independiente

- Estado: aceptado
- Fecha: 2026-08-13

## Contexto

La implementación Web actual ubica el producto dentro de inventario y concentra en una misma representación identidad, clasificación, existencia, costo promedio, valuación y precio de venta. Sin embargo, compras, ventas, inventario y dispositivos necesitan compartir la identidad del producto sin compartir esas reglas operativas.

`Catálogo` describe una consulta, pantalla o futura publicación de productos; no es el propietario de `Product` en el lenguaje actual de Kontave. Crear un dominio `catalog` introduciría una abstracción que el negocio todavía no utiliza.

Los departamentos actuales clasifican productos. En el nuevo dominio se nombran `ProductCategory` para distinguirlos de departamentos organizacionales y ubicaciones físicas.

## Decisión

Crear la capacidad `products` con `@kontave/products-domain` y `@kontave/products-testing`.

El dominio es propietario de dos aggregates independientes:

- `Product`: identidad del producto, empresa propietaria, SKU, códigos de barras, nombre, descripción, unidad base, categoría asignada y estado.
- `ProductCategory`: clasificación de productos perteneciente a una empresa, con ciclo de vida propio.

`Product` referencia una categoría solamente mediante `ProductCategoryId`. Renombrar o desactivar una categoría no reescribe sus productos. Las reglas que necesitan ambos aggregates, como asignar únicamente categorías activas de la misma empresa, pertenecen a la capa de aplicación.

El término catálogo podrá utilizarse para casos de uso como listar o buscar productos. No se crea un package ni una entidad `Catalog` sin reglas propias de publicación, surtido o canales.

## Fuera del dominio

`products` no es propietario de:

- existencias, reservas, almacenes, ubicaciones, lotes o vencimientos;
- costo promedio, capas PEPS o métodos de valuación;
- proveedores, ofertas o precios de compra;
- listas, políticas o precios de venta;
- IVA, retenciones o reglas fiscales;
- monedas, tasas de cambio o conversión monetaria.

Estas capacidades referenciarán `ProductId` y conservarán sus propios estados y snapshots.

## Invariantes iniciales

- Todo producto y categoría pertenece a una empresa.
- SKU, códigos de barras, nombres e identificadores se validan y normalizan en el dominio.
- Un producto no repite un código de barras dentro de su colección.
- Los cambios generan nuevas instancias y aumentan su versión.
- Producto y categoría tienen ciclos de activación independientes.
- La unicidad de SKU, código de barras y nombre de categoría dentro de una empresa se garantiza mediante la aplicación y restricciones de persistencia.

## Consecuencias

- El futuro dominio de inventario dependerá de `ProductId`, no de la entidad completa ni del modelo Web heredado.
- `currentStock`, `averageCost`, `valuationMethod` y `salePricing` no se migran a `Product`.
- El adapter de persistencia traducirá `inventario_departamentos` a `ProductCategory` durante la transición.
- La Web de producción permanece intacta hasta una tarea explícita de migración y pruebas de paridad.
- Variantes, presentaciones y conversiones de unidad se añadirán solamente cuando un flujo consumidor establezca sus reglas.
