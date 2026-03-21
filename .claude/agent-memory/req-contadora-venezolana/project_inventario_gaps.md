---
name: inventario_gaps
description: Gaps legales y operativos identificados en el módulo de inventario — base para REQs pendientes (2026-03-21)
type: project
---

Gaps identificados tras revisión completa del código del módulo inventario al 2026-03-21.

**Por qué:** Sirven de base para el documento de requerimientos faltantes. No duplicar con lo que ya está.

**How to apply:** Al priorizar trabajo de desarrollo, estos son los gaps confirmados por revisión de código real.

## Gaps Críticos (bloquean uso legal o generan riesgo financiero)

1. **Retenciones de IVA para contribuyentes especiales** — El libro de compras no tiene columnas para IVA retenido (75% o 100%). LibroComprasRow no tiene campo `ivaRetenido`. Afecta a cualquier empresa clasificada como contribuyente especial que compra a otros contribuyentes especiales o que sus proveedores le retienen.

2. **Retenciones de ISLR sobre compras (Art. 1 Decreto 1.808)** — No existe ningún campo ni flujo para registrar retenciones de ISLR en facturas de compra. FacturaCompra no tiene campo `islrRetenido`. Si el proveedor es persona natural o jurídica sujeta a retención, la empresa debe retener y enterar. Sin esto no se puede cuadrar el libro de compras ni las planillas de retención.

3. **Constancias de retención** — No existe función para generar las constancias de retención (ARC o comprobante de retención de IVA) exigidas por el SENIAT para entregarlas al proveedor/cliente.

4. **Nota de crédito de ventas (devolución con efecto fiscal)** — devolucion_venta solo revierte existencias. No genera un documento fiscal formal (nota de crédito) con numeración correlativa, RIF del cliente y montos de IVA corregidos. El libro de ventas no refleja notas de crédito como líneas negativas.

5. **Número de control de facturas de venta** — El dominio Movimiento tiene numeroFacturaVenta pero no número de control. La Providencia SNAT/2011/00071 exige número de control correlativo en facturas. El sistema registra ventas sin este campo obligatorio.

6. **Integración contabilidad-inventario** — No existe asiento contable automático cuando se confirma una factura de compra ni cuando se registra una venta. La contadora debe hacer los asientos manualmente cada quincena.

## Gaps Importantes (fricción significativa o riesgo operativo)

7. **Clientes como catálogo** — Las ventas requieren RIF y nombre del cliente en cada transacción. No existe un catálogo de clientes reutilizable. En un supermercado con consumidor final esto puede ser irrelevante, pero en una empresa B2B se repite el mismo cliente decenas de veces al mes.

8. **Precio de venta por producto** — El producto no tiene campo precio_venta. Cada venta requiere ingresar el precio manualmente. En un negocio con catálogo fijo esto es ineficiente y fuente de errores.

9. **Markup/precio sugerido configurable** — Identificado en FULLMARKET_PLAN.md Fase D, pendiente. El sistema calcula costo promedio pero no puede mostrar precio sugerido con markup configurable por departamento.

10. **Reporte de retenciones de IVA (formato SENIAT)** — No existe reporte de retenciones practicadas/sufridas. El SENIAT exige presentar el libro de retenciones o comprobantes periódicamente.

11. **Alertas de stock mínimo** — El dashboard muestra el KPI "bajo mínimo" pero no genera notificación activa ni lista accionable. La contadora o encargado deben revisar manualmente.

12. **Exportación PDF de reportes** — Los libros (compras, ventas, inventarios) solo exportan CSV. Para presentar ante el SENIAT o auditores se necesita PDF con membrete de la empresa.

13. **Migración masiva Excel → CSV** — Identificado en FULLMARKET_PLAN.md Fase B, parcialmente pendiente. El template CSV no acepta existencia_actual ni proveedor_nombre para linkear.

## Gaps Deseables (mejoran experiencia sin bloquear)

14. **Historial de precios de compra por producto** — El promedio ponderado aplana el historial. No hay forma de ver cómo evolucionó el costo unitario a lo largo del tiempo por producto.

15. **Múltiples proveedores por producto** — Un producto puede comprarse a varios proveedores a precios distintos. El producto solo tiene monedaDefecto pero no lista de proveedores habituales.

16. **Código de barras / código SENCAMER** — No hay campo para código de barras ni código SENCAMER. Para empresas con obligación de etiquetado regulado (alimentos, medicamentos) esto puede ser relevante.

17. **Conciliación inventario físico vs. sistema** — No hay flujo de toma de inventario físico (contar físicamente y comparar vs. existencias del sistema para generar ajustes masivos).
