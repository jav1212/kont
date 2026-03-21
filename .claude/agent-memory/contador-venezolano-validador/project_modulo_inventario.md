---
name: Validacion Modulo Inventario — Primera revision completa
description: Resultado de la validacion legal y funcional del modulo de inventario de kont contra legislacion venezolana vigente. Fecha: 2026-03-21.
type: project
---

Primera revision completa del modulo de inventario realizada el 2026-03-21. Cubre: compras, ventas, movimientos, produccion, kardex, libro compras, libro ventas, libro inventarios, reporte periodo, reporte saldo, reporte ISLR Art. 177, cierres de periodo, integracion BCV.

**Estado general:** CON ERRORES CRITICOS Y OBSERVACIONES IMPORTANTES

**Errores criticos identificados (bloquean produccion):**
1. IVA reducido (8%) en ventas: el libro de ventas y el formulario de ventas solo soportan 'general' (16%) o 'exento'. No existe la alicuota reducida del 8% en el lado ventas. Esto viola el Art. 62 de la Ley del IVA para productos con alicuota reducida.
2. Reversion de costo promedio al eliminar factura confirmada: la formula matematica es algebraicamente incorrecta para el caso donde hay movimientos intermedios. Puede producir costos promedio negativos o distorsionados.
3. Libro de ventas sin separacion por alicuota: solo tiene baseGravada (16%) y baseExenta. Falta columna base_gravada_8 e iva_8 para ventas con alicuota reducida.
4. RIF del cliente no obligatorio en ventas: el sistema permite registrar ventas sin RIF del cliente, lo que viola el Art. 14 de la Providencia Administrativa sobre Facturacion del SENIAT (requisito formal de factura).

**Observaciones importantes (riesgo moderado):**
1. El Reporte ISLR Art. 177 usa funcion RPC 'tenant_inventario_kardex_periodo' — verificar que incluye saldo inicial del periodo anterior (apertura). Aparentemente si lo incluye segun el mapeo.
2. PEPS declarado disponible pero no validada la implementacion — costo_promedio en producto sugiere que toda la logica real es promedio ponderado. Si un usuario elige PEPS, el sistema puede estar calculando promedio igual.
3. Reporte SALDO: el calculo de costo_inicial usa costo_promedio ACTUAL del producto, no el historico del momento de apertura. Puede distorsionar el reporte si el costo cambio durante el periodo.
4. No hay validacion de formato de RIF en proveedores ni clientes (J-XXXXXXXX-X).
5. Cierre de periodo: se registra la tasa BCV pero NO se usa para recalcular los costos en Bs de items en moneda extranjera que quedaron pendientes. Es solo referencia.
6. El campo ivaTipo en productos solo tiene 'exento' o 'general' (sin opcion reducida_8). Un producto que tributa al 8% no puede configurarse correctamente a nivel de producto.

**Conformidades destacadas:**
- Metodo de valuacion: solo promedio ponderado y PEPS (UEPS excluido — correcto segun SENIAT).
- Multi-tasa IVA en compras: correcto, tiene exenta/8%/16% por linea de item.
- Integracion tasa BCV: usa precio de venta (sell) del BCV con fallback hasta 7 dias atras — correcto.
- Libro de compras: estructura conforme al Reglamento LIVA Art. 70-72.
- Control de periodo cerrado: bloquea movimientos en periodos cerrados — correcto.
- Libro de inventarios: calcula saldo inicial/entradas/salidas/saldo final anual — conforme al Codigo de Comercio Art. 36.
- Reporte ISLR Art. 177: estructura de kardex por producto con apertura — conforme.

**Why:** Revision solicitada como parte del proceso de validacion legal antes de lanzamiento piloto.
**How to apply:** En futuras revisiones, partir de estos hallazgos como base y verificar si fueron corregidos.
