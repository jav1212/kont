# ADR 0021: Documentos fiscales independientes de ventas y del dispositivo emisor

- Estado: aceptado
- Fecha: 2026-08-13

## Contexto

Kontave necesita modelar facturas antes de construir los nuevos contextos de compras y ventas. Una venta puede requerir o no una factura, una recepcion o despacho puede ocurrir en otro momento y la impresion es solamente una representacion del documento.

El manual venezolano de protocolos HKA V8.5.0 evidencia el lenguaje fiscal que debe soportarse inicialmente: factura, nota de credito, nota de debito, emisor y receptor identificados, lineas con cantidades y precios, conceptos exentos o sujetos a diferentes tratamientos, descuentos y recargos por monto o porcentaje, bases imponibles, impuestos, pagos parciales en distintas monedas, totales y referencia obligatoria al documento afectado por una nota.

El manual tambien contiene comandos, limites de caracteres, configuracion y estados de impresoras. Esos elementos describen un adaptador y no el dominio fiscal.

## Decision

Crear `@kontave/fiscal-domain` y `@kontave/fiscal-testing` como capacidad propietaria del documento fiscal.

`FiscalDocument` mantiene la misma identidad durante su preparacion y emision o recepcion. Imprimir, enviar por correo o renderizar un PDF no cambia su naturaleza ni forma parte de su estado de dominio. `type` distingue factura, nota de credito y nota de debito; `direction` distingue documentos emitidos y recibidos sin inventar una clase `PurchaseInvoice`.

El primer corte admite:

- factura de venta, nota de credito y nota de debito;
- snapshots del emisor y receptor para preservar su identidad historica;
- lineas de bienes o servicios con referencia comercial opcional;
- descuentos y recargos de linea o documento, por monto o porcentaje;
- determinaciones tributarias explicitas con codigo, categoria, tasa, base, importe, jurisdiccion y version de regla;
- asignaciones de pago en cualquier moneda con importe reconocido en la moneda del documento y snapshot cambiario opcional;
- totales reconciliados, incluyendo saldo pendiente y cambio;
- referencias externas suficientes para afectar documentos emitidos por otro sistema;
- evidencia de emision separada del documento y neutral respecto al proveedor o dispositivo.

Las denominaciones venezolanas como IVA e IGTF se expresan mediante codigos y politicas tributarias versionadas, no mediante campos rigidos ni tasas incrustadas en la factura. El documento conserva el resultado aplicado; el futuro paquete de reglas tributarias determina ese resultado.

## Invariantes

- Todo documento pertenece a una empresa, jurisdiccion y moneda de documento.
- Una nota de credito o debito debe referenciar exactamente un documento fiscal afectado; una factura no lo hace.
- Cada linea conserva descripcion, cantidad, precio y resultados monetarios historicos aunque cambie el producto o servicio original.
- Descuentos y recargos son causas comerciales explicitas, no lineas negativas anonimas.
- Los importes de una linea y del documento deben usar la moneda del documento.
- Neto equivale a bruto menos descuentos mas recargos.
- Total a pagar equivale a neto mas impuestos.
- Total a pagar equivale a pagos reconocidos menos cambio mas saldo pendiente.
- Los impuestos agregados deben reconciliar con las determinaciones conservadas.
- Un borrador no posee numero fiscal ni instante de emision.
- Un documento emitido posee ambos y no expone operaciones de edicion.

## Fronteras

`fiscal` no es propietario de:

- la negociacion comercial, pedidos, compras o ventas;
- recepciones, despachos, devoluciones fisicas ni movimientos de inventario;
- cuentas por cobrar, cuentas por pagar o movimientos de caja;
- reglas tributarias venezolanas vigentes ni sus tasas;
- comandos, puertos, memoria, seriales o capacidades de una impresora;
- PDF, papel, correo, layout o cualquier otra representacion.

Ventas y compras podran solicitar la preparacion de un documento mediante puertos de aplicacion. Inventario reaccionara al hecho fisico correspondiente y no a la mera existencia de la factura. Un adaptador HKA traducira el documento emitible a su protocolo y devolvera evidencia de emision.

## Consecuencias

- `sales` podra completar operaciones facturadas y no facturadas sin poseer el agregado fiscal.
- Factura, despacho, pago y movimiento de inventario conservaran identidades y ciclos de vida independientes.
- Cambiar de impresora o incorporar factura digital no exigira modificar el dominio.
- Las reglas venezolanas de IVA, IGTF, exenciones, retenciones y redondeo se implementaran despues como politicas versionadas y verificadas contra fuentes normativas.
- El esquema Web de produccion permanece intacto hasta una migracion explicita.
