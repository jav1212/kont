# ADR 0031: Precio comercial y analítica económica separados de Products

- Estado: aceptado
- Fecha: 2026-08-16

## Contexto

La ficha de producto necesita mostrar una política de precio vigente, clasificación tributaria, costo de adquisición y precio realizado en ventas. Aunque Producción guarda parte de estos valores en tablas históricas de inventario, no representan una sola entidad ni comparten ciclo de vida.

## Decisión

- `products` conserva identidad, clasificación de catálogo, unidad y estado.
- `pricing` posee la política vigente de precio sugerido: importe fijo o markup, moneda de cotización y versión independiente.
- `taxation` posee la clasificación tributaria temporal y resuelve tasas mediante reglas versionadas.
- `product-insights` es un read model de aplicación que compone compras y ventas confirmadas. No introduce un dominio ni convierte movimientos de inventario en documentos comerciales.
- La API puede devolver una proyección compuesta, pero cada agregado se modifica con su propio `expectedVersion`.

## Reglas

- Los precios, porcentajes, cantidades y tasas cruzan contratos como strings decimales.
- Un markup conserva la moneda en la que se cotiza el resultado calculado.
- Los precios realizados proceden de documentos confirmados; una salida manual con precio no se etiqueta como venta facturada.
- La agregación diaria, semanal o mensual devuelve promedios ponderados por cantidad, no eventos disfrazados de buckets.
- Las conversiones históricas usan snapshots de la operación, nunca la tasa operativa actual.
- La valuación continúa en Inventory y sólo admite promedio ponderado mientras no exista otra política portable.

## Compatibilidad

Los adaptadores `shared` traducen temporalmente `sale_price_*` y `vat_type`. Producción Web no cambia y las nuevas tablas/versiones son aditivas.
