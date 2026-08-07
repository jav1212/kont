# Conciliación de compras — julio 2026

Empresa: PANADERIA Y PASTELERIA LA MANSIÓN DE SUCRE, C.A.  
RIF: J-29767818-2  
Tenant: oficinakm11 (`oficinakm11@gmail.com`)

## Fuente contable

Los cuatro PDF suministrados corresponden al `Libro de Compras` y contienen el detalle de las facturas:

- 01/07/2026–15/07/2026: 40 renglones, total compras con IVA `1.718.592,14`.
- 16/07/2026–31/07/2026: 32 renglones, total compras con IVA `1.179.155,04`.
- Total contable esperado: `2.897.747,18`.

## Resultado en Supabase

La consulta al inventario se realizó usando `period = '2026-07'`:

- 69 facturas.
- Total registrado: `2.821.179,58`.
- Diferencia contra el libro: `76.567,60` faltantes.
- Todas figuran con estado `confirmada`.
- El período contiene facturas con fechas de marzo, mayo y junio, además de julio; por eso no debe sustituirse el criterio por fecha de factura sin una reclasificación contable.

## Controles adicionales

- En el libro aparece la línea con número de control `08-1211113` como documento negativo por `-27.924,22`. Debe conciliarse como una nota de crédito/devolución o reverso, conservando el signo negativo; no debe convertirse en una compra positiva.
- El listado de los PDF contiene tres líneas negativas, todas en el libro del 01/07–15/07:
  - Control `00-29620151`: `-3.645,94`, asociado al documento afectado `3595364392`.
  - Control `08-1211113`: `-27.924,22`, asociado al documento afectado `7072671671`.
  - Control `08-1211114`: `-22.839,59`, asociado al documento afectado `7072671672`.
  - Total de notas negativas en los PDF: `-54.409,75`.
- En Supabase no hay ninguna factura con `total < 0` en el período julio. Solo existe una factura positiva con control `00-29620151` y total `3.645,96`; las líneas `08-1211113` y `08-1211114` no aparecen como facturas registradas. Los documentos afectados `7072671671` y `7072671672` sí aparecen como compras positivas de otros controles.

- No se detectaron números de factura duplicados en las 69 facturas del período.
- Los encabezados cuadran: subtotal + IVA = total.
- Una factura no cuadra contra sus propios ítems: factura `7072686326` de Pepsi-Cola Venezuela, C.A.; subtotal del encabezado `78.781,32`, suma de ítems `81.161,45`, diferencia `2.380,13`.
- Hay 240 movimientos de inventario del período; 210 están vinculados a una factura y 30 no tienen factura asociada.
- No hay asientos contables publicados para la empresa en julio.
- La integración contable aparece omitida porque no existen reglas configuradas para Compras (`inventory_purchase`, estado `skipped`).

## Estado del cruce individual

La comparación visual de los PDF confirma los listados y sus totales. El cruce final número-a-número contra Supabase queda pendiente de ejecutar porque el MCP perdió autorización durante la consulta de detalle. No se modificaron facturas, movimientos ni asientos.

## Conclusión provisional

El inventario no contiene actualmente el mismo total que los libros contables: faltan `76.567,60` respecto al total esperado de `2.897.747,18`. Además, existe una inconsistencia interna en la factura `7072686326`, 30 movimientos sin factura y ausencia de integración contable para Compras.
