# ADR 0018: Inventario como ledgers coordinados de existencias y valuación

- Estado: aceptado
- Fecha: 2026-08-13

## Contexto

La implementación Web actual representa cada movimiento mediante una fila que combina el hecho físico, saldos acumulados, valuación, precios comerciales, impuestos, descuentos, recargos y referencias cambiarias. También mantiene existencia y costo promedio dentro del producto. Esta estructura resuelve consultas inmediatas, pero mezcla responsabilidades y permite que un cambio comercial altere el significado del inventario.

El nuevo núcleo debe explicar de forma determinista qué cantidad existe, dónde se encuentra, por qué cambió y qué valor económico fue reconocido. Compras, ventas, producción y migración originan operaciones, pero no pertenecen al dominio de inventario.

## Decisión

Crear `@kontave/inventory-domain` y `@kontave/inventory-testing`. El dominio se modela mediante dos ledgers coordinados:

1. El ledger físico registra operaciones inmutables y sus efectos de cantidad por producto, ubicación y lote.
2. El ledger de valuación registra el valor funcional reconocido para esos efectos mediante una política explícita.

`Product` y `ProductCategory` permanecen en `products`. Inventario los referencia mediante `ProductId` y conserva únicamente su configuración operativa en `InventoryProfile`.

Una operación confirmada no se edita ni elimina. Una corrección crea una operación inversa vinculada a la original. Las posiciones de existencia y valuación son estados derivados, no hechos históricos ni atributos del producto.

## Modelo físico inicial

- `InventoryProfile`: política de seguimiento, stock negativo, valuación y ciclo de vida para un producto.
- `InventoryLocation`: ubicación física dentro de una empresa.
- `InventoryOperation`: unidad atómica originada por compra, venta, devolución, transferencia, conteo, autoconsumo o producción.
- `StockEffect`: cambio firmado de cantidad en una ubicación y lote opcional.
- `StockPosition`: cantidad derivada para una combinación de producto, ubicación y lote.
- `StockLot`: identidad de lote, fabricación, vencimiento y estado.
- `StockCount`: evidencia de un conteo físico que puede originar un ajuste.
- `InventoryPeriod`: período operativo que controla admisión de nuevas operaciones.

Las cantidades usan decimales exactos y la unidad base pública de `products`. El ledger no utiliza `number` para cantidades.

## Valuación inicial

El primer corte implementa únicamente promedio ponderado. Los costos unitarios conservan precisión decimal independiente de la unidad menor monetaria; los totales se cuantizan como `Money` usando `@kontave/monetary-domain`.

PEPS no se declara como método soportado hasta implementar capas, consumos y trazabilidad completos. Los productos heredados configurados como PEPS constituyen un bloqueo de migración que debe detectarse durante la auditoría de paridad.

El stock negativo se modela como una política explícita del perfil, nunca como un booleano proporcionado por la interfaz. Cuando está permitido, una salida sin cobertura se valora provisionalmente con el último promedio conocido, abre una exposición por la cantidad no cubierta y se revalúa cuando una recepción posterior la repone. Sin un costo histórico conocido, la salida negativa se rechaza.

## Fronteras

Inventario no es propietario de:

- precio de compra o venta;
- descuentos, recargos, IVA o retenciones;
- proveedores, clientes o documentos comerciales;
- monedas originales ni snapshots cambiarios;
- fórmulas de producción;
- alertas, rotación, PDF o reportes.

Compras determina el costo de adquisición y entrega a valuación un importe ya reconocido en la moneda funcional. Ventas determina el ingreso comercial; inventario determina independientemente el costo de la salida. Ningún contrato nuevo utiliza términos específicos de USD como `dollarRate`.

## Invariantes

- Una operación requiere al menos un efecto no nulo.
- Entradas y salidas respetan el signo definido por su motivo.
- Una transferencia conserva la cantidad por producto, unidad y lote entre ubicaciones distintas.
- Todo efecto pertenece a un perfil activo de la misma empresa y respeta su política de lote.
- Una posición negativa solamente es válida cuando el perfil lo permite.
- Toda cantidad negativa valuada está respaldada por exposiciones abiertas que identifican las salidas provisionales.
- Una recepción liquida exposiciones negativas en orden y reconoce separadamente la diferencia entre costo provisional y costo efectivo.
- La misma clave de origen no puede contabilizarse dos veces; la aplicación y persistencia garantizan esta unicidad.
- Una operación confirmada solamente cambia mediante reverso.
- Un reverso replica exactamente los efectos con signo contrario y referencia la operación original.
- Un período cerrado rechaza nuevas operaciones con fecha efectiva dentro de él.
- La valuación usa una sola moneda funcional por posición y reconcilia cantidad y valor.
- Un conteo confirmado conserva las cantidades esperada y observada; su diferencia origina un ajuste separado.

## Fechas

`effectiveDate` representa la fecha empresarial del hecho físico y `postedAt` el instante de contabilización. Una fecha efectiva anterior no reordena silenciosamente la valuación. El soporte de operaciones retroactivas requerirá una política explícita de reapertura o revaluación.

## Consecuencias

- `Product.currentStock` y `Product.averageCost` no se migran a `products`; se reconstruyen como posiciones de inventario.
- El comportamiento heredado que permite negativos sin revaluación no se migra como regla válida; debe producir exposiciones y ajustes trazables.
- Los reportes consumirán proyecciones construidas desde los ledgers, no campos comerciales copiados en cada movimiento.
- Compras, ventas y producción dependerán de puertos de aplicación para solicitar operaciones; inventario no importará sus entidades.
- La Web de producción permanece intacta hasta completar paridad, backfill, cutover y eliminación del esquema heredado.
- La persistencia se diseñará después de validar el comportamiento puro; este ADR no prescribe tablas ni RPC.
