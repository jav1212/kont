# ADR 0042: Cuentas por cobrar de ventas POS ancladas a una moneda

- Estado: aceptado
- Fecha: 2026-09-25

## Contexto

En Venezuela, una venta entregada a crédito puede pactarse en una moneda cuyo
valor frente al bolívar cambia antes del cobro. Guardar solamente el total de la
factura en VES hace que el saldo pierda la moneda acordada; recalcular una venta
confirmada con una tasa actual también reescribe un hecho histórico.

El POS ya obtiene un catálogo multimoneda y sus tasas desde el adaptador de
tasas. USD no puede ser una suposición del modelo: la moneda de la deuda y la
moneda recibida deben poder ser cualquiera de las disponibles en ese catálogo,
incluido VES.

## Decisión

Una factura confirmada con `payment_terms = credito` crea una cuenta por cobrar
única. El crédito requiere un cliente identificado, una fecha de vencimiento y
el snapshot de moneda, monto, tasa, fecha efectiva y fuente de tasa con que se
estableció la deuda. El cliente genérico `consumer-final:<companyId>` no puede
recibir crédito.

La deuda se conserva en `debt_currency_code`; el importe de la factura en VES y
la tasa de la venta son evidencia histórica. La pantalla POS calcula el
principal como el total de la factura en VES dividido por la tasa de la moneda
seleccionada, y persiste el snapshot que produjo ese importe. Para VES se usa
la tasa identidad; las demás monedas toman su tasa y procedencia del catálogo
publicado. Una factura de crédito no se confirma si falta alguno de esos datos
y el POS no permite elegir un vencimiento anterior a la fecha de venta.

Cada cobro crea un registro inmutable con el importe recibido, moneda recibida,
su propio snapshot de tasa, método y referencia opcionales. El importe que
reduce la deuda es:

```
importe aplicado = importe recibido × tasa del pago a VES ÷ tasa de la deuda a VES
```

Por ello un abono puede estar en una moneda distinta de la deuda. El saldo es el
principal menos la suma de `applied_debt_amount`; una cuenta pasa a `settled`
solamente al cubrirse el principal. La fecha de vencimiento no cambia el cálculo
del saldo y permite mostrar una cuenta parcialmente pagada como vencida.

La función transaccional de Supabase bloquea la cuenta durante el cobro. Exige
una clave de idempotencia por tenant, devuelve el abono ya registrado cuando se
repite la misma clave y rechaza un abono que exceda el saldo. Una venta de
crédito que ya tiene abonos tampoco puede volver a borrador. Estas guardas
preservan el historial ante reintentos de red o doble envío desde caja.

## Persistencia y despliegue

Los archivos locales de migración
[20260925192503](../../supabase/migrations/20260925192503_sales_credit_receivables.sql),
[20260925192914](../../supabase/migrations/20260925192914_sales_receivable_identity_rate_source.sql),
[20260925193135](../../supabase/migrations/20260925193135_credit_requires_identified_customer.sql) y
[20260925193901](../../supabase/migrations/20260925193901_receivable_payment_idempotency_race.sql)
son una unidad de despliegue. Añaden los snapshots a
`shared_inventory_sales_invoices`, crean `shared_sales_receivables` y
`shared_sales_receivable_payments`, refuerzan la fuente `identity` y la
identidad del cliente, y cierran una carrera de idempotencia al volver a revisar
la clave después de bloquear la cuenta durante el cobro.

La migración es aditiva: no convierte facturas existentes en crédito ni crea
cuentas por cobrar retroactivas. Debe aplicarse antes de desplegar el POS y la
pantalla de cuentas por cobrar que escriben o leen estos registros. El único
ejecutor de la RPC de cobro es `service_role`; la aplicación la invoca mediante
una ruta de servidor autorizada con `sales.create`. Las lecturas se limitan al
tenant autorizado y requieren `sales.read`.

Los prefijos con marca de tiempo de los archivos coinciden con las entradas que
Supabase MCP registró al aplicar la migración. Esto evita colisiones y una
reaplicación futura frente a migraciones concurrentes de ventas.

## Consecuencias

Ventas, inventario y el cobro posterior permanecen como hechos separados: la
confirmación entrega la venta y genera la cuenta; los abonos posteriores no
modifican el principal ni el snapshot de la venta. La experiencia Kiosco y el
POS administrativo comparten este contrato y muestran la moneda de la deuda
por separado de la moneda recibida.

Cuotas, intereses, límites de crédito, notas de crédito y reversos de abonos no
forman parte de este corte. Cualquier corrección futura debe conservar los
snapshots y la trazabilidad del cobro ya registrado.

Esta decisión amplía la frontera de cobros comerciales prevista en
[ADR 0024](0024-sales-dispatch-fiscal-and-pos-boundaries.md) y conserva la regla
de snapshots de documentos de [ADR 0012](0012-exchange-rate-providers.md).
