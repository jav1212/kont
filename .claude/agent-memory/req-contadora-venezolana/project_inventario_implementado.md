---
name: inventario_implementado
description: Funcionalidades confirmadas como implementadas en el módulo de inventario de kont al 2026-03-21
type: project
---

Módulo de inventario revisado al 2026-03-21. Funcionalidades presentes en código:

**Por qué:** Registro de lo que ya existe para no duplicar requerimientos en futuras conversaciones.

**How to apply:** Al generar nuevos REQs para el módulo inventario, verificar contra esta lista antes de clasificar algo como faltante.

## Lo que está implementado

### Catálogos
- Productos: CRUD completo, tipos (mercancía/materia prima/producto terminado), unidades de medida, método valuación (solo promedio ponderado — PEPS es opción de dominio pero UI solo muestra promedio), IVA (exento/general), moneda defecto (B/D), departamento, existencia mínima, importación/exportación CSV
- Proveedores: CRUD completo, RIF, datos de contacto, importación/exportación CSV
- Departamentos: CRUD completo

### Compras
- Facturas de compra con estados borrador/confirmada
- Items de factura con multi-alícuota IVA (exenta/8%/16%)
- Multi-moneda en items (B/D con tasa BCV y costo en moneda original como referencia)
- Número de factura y número de control
- Flujo borrador → confirmar → genera movimiento entrada_compra
- Eliminación de facturas confirmadas con advertencia (sin bloqueo total)

### Movimientos
- Tipos: entrada_compra, salida_venta, entrada_produccion, salida_produccion, ajuste_positivo, ajuste_negativo, devolucion_compra, devolucion_venta, autoconsumo
- Registro de ventas con RIF cliente, nombre cliente, número factura, precio venta, IVA venta
- Multi-moneda en movimientos (campos moneda, costoMoneda, tasaDolar como referencia histórica)
- Costo siempre en Bs como valor canónico

### Producción/Transformación
- Transformaciones: consumo de materias primas → generación de producto terminado

### Reportes
- Kardex por producto (histórico completo de movimientos con saldos)
- Reporte de período por producto (existencias, costos, entradas, salidas)
- Libro de Compras por período (con columnas: base exenta, base 8%, IVA 8%, base 16%, IVA 16%, total)
- Libro de Ventas por período (con columnas: base gravada, IVA débito, base exenta, autoconsumo)
- Libro de Inventarios anual (por producto: cant/valor inicial, entradas, salidas, final, compras)
- Reporte ISLR de inventario (kardex por producto con apertura de período)
- Reporte SALDO por departamento (agrupado: unidades y costos de inicial, entradas, salidas, existencia)

### Control de períodos
- Cierres de período con tasa BCV (consulta automática a BCV para último día del período)
- Bloqueo de movimientos en períodos cerrados

### Infraestructura
- Multi-tenancia: cada empresa tiene schema separado
- API BCV integrada para tasa USD al cierre

## Gaps identificados (para REQs)
Ver project_inventario_gaps.md
