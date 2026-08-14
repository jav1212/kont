# ADR 0024: Ventas separa acuerdo, despacho, documento fiscal y experiencia POS

- Estado: aceptado
- Fecha: 2026-08-14

## Contexto

La implementacion Web heredada confirma una factura y descarga inventario en la misma operacion. Tambien conserva precios, impuestos, cobros, tasas y datos de entrega dentro de una representacion unica orientada a formularios. Ese atajo no representa pedidos y entregas parciales, facturacion previa o posterior, notas de credito sin retorno fisico, devoluciones ni reintentos seguros.

La nueva arquitectura ya dispone de `products`, `monetary`, `taxation`, `fiscal` e `inventory`. Ventas debe coordinarlos sin duplicar su conocimiento. La aplicacion tendra una experiencia POS, pero su layout, carrito, escaner y atajos no constituyen reglas del dominio de ventas.

## Decision

Crear `@kontave/sales-domain`, `@kontave/sales-application`, `@kontave/sales-inventory` y `@kontave/sales-testing`.

El dominio distingue:

- `Customer`: contraparte comercial;
- `SalesOrder`: acuerdo de cantidades, precios, ajustes, moneda y condiciones de pago;
- `GoodsDispatch`: evidencia de bienes entregados desde una ubicacion y lote;
- `CustomerInvoiceMatch`: conciliacion de un `FiscalDocument` emitido contra lineas acordadas y despachadas;
- `CustomerReturn`: devolucion fisica del cliente.

Una orden o factura no mueve inventario. Confirmar `GoodsDispatch` produce `SalesDispatchConfirmed`; confirmar `CustomerReturn` produce `CustomerReturnConfirmed`. La aplicacion persiste el aggregate y el evento en una misma transaccion mediante un puerto de commit/outbox. Un consumidor traduce cada evento a una operacion idempotente de inventario.

## Frontera POS

El POS es una experiencia de presentacion y un flujo de aplicacion. Puede coordinar precio, tributacion, documento fiscal, despacho, cobro e impresion, pero no cambia las invariantes de `sales-domain`.

No se agrega `pos`, `cart`, layout, terminal o dispositivo al dominio por el solo hecho de que una pantalla los utilice. Un origen o canal solo se convierte en concepto de negocio cuando gobierna una politica real, por ejemplo numeracion, precio, almacen, autorizacion o devolucion. Caja, turno y arqueo pertenecen a una capacidad `point-of-sale` separada si llegan a necesitarse.

## Invariantes

- Todos los aggregates y referencias pertenecen a una empresa y cliente coherentes, verificados por aplicacion.
- Una orden contiene al menos una linea; bienes inventariables requieren `ProductId` y servicios no se despachan como stock.
- Cantidades y precios usan decimales y dinero exactos; una orden utiliza una sola moneda de transaccion.
- Un despacho contiene al menos una linea inventariable positiva con ubicacion y lote opcional.
- La suma despachada contra una linea no supera la cantidad ordenada salvo una politica explicita de tolerancia.
- Un despacho confirmado no se edita. Su correccion crea un reverso o una devolucion.
- Cada evento de inventario declara una `operationKey` determinista; reintentos no duplican movimientos.
- Una factura se representa mediante `FiscalDocumentId`; ventas no duplica impuestos, partes, pagos ni totales fiscales.
- Una factura emitida debe corresponder a la empresa y al cliente de la conciliacion.
- Una nota de credito sin devolucion fisica no crea entrada. Una devolucion confirmada crea `customer_return` aunque la nota fiscal se emita en otro momento.
- El costo de salida lo determina inventario. Ventas nunca usa el precio comercial como costo de inventario.

## Integracion

`sales-application` declara puertos. `sales-inventory` conoce ambos modelos y crea `InventoryOperation` con origen `sales`, razon `sales_issue` o `customer_return`, y efectos por producto, ubicacion y lote. Inventario conserva la propiedad del ledger fisico y de valuacion.

`taxation` determina reglas e importes y `taxation-fiscal` los convierte en snapshots del documento. Ventas coordina ese proceso desde aplicacion, pero `sales-domain` no importa politicas tributarias venezolanas.

El package existente `payments` pertenece al billing de la plataforma y no se reutiliza como cuentas por cobrar comerciales. Cobros, saldos, caja y conciliacion financiera requeriran una frontera posterior.

La persistencia, Supabase, RPC, UI, impresion, hardware y migracion Web quedan fuera de este corte. La Web de produccion permanece congelada.
