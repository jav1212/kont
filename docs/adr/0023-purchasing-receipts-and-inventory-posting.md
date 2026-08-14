# ADR 0023: Compras separa acuerdo, recepcion, factura y contabilizacion de inventario

- Estado: aceptado
- Fecha: 2026-08-13

## Contexto

Una compra puede ordenarse, recibirse, facturarse y pagarse en momentos distintos. La implementacion heredada confirma una factura fisica y crea movimientos, pero ese atajo no representa recepciones parciales, facturas previas o posteriores, servicios, devoluciones ni reintentos seguros.

Los dominios `products`, `taxation`, `fiscal` e `inventory` ya poseen identidad de producto, determinacion tributaria, documentos recibidos y ledgers fisicos/valorados respectivamente.

## Decision

Crear `@kontave/purchasing-domain`, `@kontave/purchasing-application`, `@kontave/purchasing-inventory` y `@kontave/purchasing-testing`.

El dominio distingue:

- `Supplier`: contraparte comercial de compras;
- `PurchaseOrder`: acuerdo de cantidades, precios y moneda;
- `GoodsReceipt`: evidencia de lo recibido, donde, en que lote y con que valor de adquisicion reconocido o provisional;
- `SupplierInvoiceMatch`: conciliacion de un `FiscalDocument` recibido contra lineas ordenadas y recibidas;
- `PurchaseReturn`: devolucion fisica al proveedor.

Una orden o factura no mueve inventario. Confirmar `GoodsReceipt` produce un evento inmutable `PurchaseReceiptConfirmed`; confirmar `PurchaseReturn` produce `PurchaseReturnConfirmed`. La aplicacion persiste el aggregate y el evento en una misma transaccion mediante un puerto de commit/outbox. Un consumidor traduce el evento a una operacion idempotente de inventario.

## Invariantes

- Todos los aggregates y referencias pertenecen a una empresa y proveedor coherentes, verificados por aplicacion.
- Una orden contiene al menos una linea; bienes inventariables requieren `ProductId` y los conceptos no inventariables no pueden recibirse como stock.
- Cantidades y precios usan decimales y dinero exactos; una orden utiliza una sola moneda de transaccion.
- Una recepcion contiene al menos una linea inventariable positiva con ubicacion, lote opcional y valor funcional no negativo.
- La suma recibida contra una linea no puede superar la cantidad ordenada salvo una politica explicita de tolerancia; la aplicacion verifica acumulados.
- Una recepcion confirmada no se edita. Su correccion crea reverso o devolucion, no actualiza el ledger historico.
- Cada evento declara una `operationKey` determinista; reintentos no duplican inventario.
- El valor provisional se identifica como tal. Su sustitucion posterior requiere un ajuste de valuacion trazable, nunca reescritura silenciosa.
- Una factura recibida se referencia mediante `FiscalDocumentId`; compras no duplica sus impuestos, partes ni totales.
- Nota de credito sin devolucion fisica no crea salida. Devolucion confirmada si crea `supplier_return` aunque la nota llegue despues.

## Costos

Compras entrega a inventario un valor de adquisicion en moneda funcional por linea recibida. La politica de costo puede incorporar precio neto, costos directamente atribuibles e impuestos no recuperables, y excluir impuestos recuperables. Este ADR no fija una politica contable universal.

Cuando la factura aun no existe se permite un valor provisional con fundamento explicito. La futura conciliacion de factura genera ajustes de valuacion por diferencia; no altera la cantidad fisica.

## Integracion

`purchasing-application` declara puertos. `purchasing-inventory` conoce ambos modelos y crea `InventoryOperation` con origen `purchasing`, razon `purchase_receipt` o `supplier_return`, y efectos por producto, ubicacion y lote. Inventario sigue siendo el unico propietario del ledger.

La persistencia, Supabase, RPC, UI y migracion Web quedan fuera de este corte. La Web de produccion permanece congelada.
