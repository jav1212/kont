---
name: Errores criticos y observaciones pendientes — Modulo Inventario
description: Lista de hallazgos que requieren correccion, con prioridad y referencia legal. Actualizar cuando se corrijan.
type: project
---

## Errores Criticos (Alta Prioridad — bloquean produccion)

### EC-001: IVA reducido (8%) ausente en ventas
- **Modulo:** Inventario / Ventas
- **Archivos:** app/(app)/inventory/ventas/page.tsx, src/modules/inventory/backend/domain/libro-ventas.ts
- **Problema:** El formulario de ventas solo tiene ivaTipo: 'general'|'exento'. No existe la opcion reducida (8%). El libro de ventas tampoco tiene columnas base_gravada_8 ni iva_8.
- **Base legal:** Art. 62 Ley del IVA (alicuota reducida del 8% para determinados bienes); Providencia SENIAT sobre formato del libro de ventas.
- **Estado:** PENDIENTE DE CORRECCION
- **Detectado:** 2026-03-21

### EC-002: Reversion incorrecta de costo promedio al eliminar factura confirmada
- **Modulo:** Inventario / Compras
- **Archivos:** supabase/migrations/026_inventory_factura_delete_confirmed.sql
- **Problema:** La formula de reversion (existencia_act * costo_prom - cantidad * costo_unitario) / nueva_existencia es algebraicamente incorrecta si hubo movimientos intermedios entre la compra original y la eliminacion. El costo promedio actual ya incorpora esos movimientos intermedios.
- **Base legal:** Principios contables VEN-NIF PyME Seccion 13 (Inventarios); SENIAT puede objetar el costo de ventas si el kardex muestra inconsistencias.
- **Estado:** PENDIENTE DE CORRECCION
- **Detectado:** 2026-03-21

### EC-003: RIF del cliente no obligatorio en ventas
- **Modulo:** Inventario / Ventas
- **Archivos:** app/(app)/inventory/ventas/page.tsx
- **Problema:** El campo clienteRif es opcional. El sistema permite registrar ventas sin RIF del comprador.
- **Base legal:** Art. 14 Providencia Administrativa N° SNAT/2011/00071 (Facturacion) — el RIF del comprador es requisito formal obligatorio en toda factura.
- **Estado:** PENDIENTE DE CORRECCION (hacer obligatorio o al menos advertir)
- **Detectado:** 2026-03-21

## Observaciones Importantes (Prioridad Media)

### OB-001: PEPS no implementado realmente
- **Modulo:** Inventario / Productos
- **Problema:** El campo metodo_valuacion acepta 'peps' pero toda la logica de costo en las RPCs (factura_confirmar, movimientos_save) usa costo_promedio del producto. PEPS requiere capa de lotes.
- **Estado:** PENDIENTE — evaluar si se implementa o se elimina la opcion hasta que este lista.
- **Detectado:** 2026-03-21

### OB-002: Costo inicial en Reporte SALDO usa costo promedio actual
- **Modulo:** Inventario / Reporte SALDO
- **Archivos:** supabase/migrations/024_inventory_reporte_saldo.sql
- **Problema:** La formula costo_inicial = saldo_cantidad * p.costo_promedio usa el costo_promedio vigente del producto, no el historico al inicio del periodo. Si el costo cambio durante el periodo, el saldo inicial estara mal calculado.
- **Estado:** PENDIENTE DE CORRECCION
- **Detectado:** 2026-03-21

### OB-003: ivaTipo en productos no tiene opcion reducida_8
- **Modulo:** Inventario / Productos
- **Archivos:** src/modules/inventory/backend/domain/producto.ts
- **Problema:** IvaTipo = 'exento' | 'general'. No existe 'reducida_8'. Un producto sujeto al 8% no puede configurarse correctamente.
- **Estado:** PENDIENTE
- **Detectado:** 2026-03-21

### OB-004: Sin validacion de formato RIF
- **Modulo:** Inventario / Proveedores y Ventas
- **Problema:** El RIF de proveedores y clientes es texto libre sin validacion de formato (J-XXXXXXXX-X, V-XXXXXXXX, etc.). Puede generar errores en el libro de compras ante el SENIAT.
- **Estado:** PENDIENTE (mejora)
- **Detectado:** 2026-03-21

### OB-005: Sin retencion de IVA para contribuyentes especiales
- **Modulo:** Inventario completo
- **Problema:** El sistema no tiene configuracion de 'contribuyente especial'. Si el usuario es contribuyente especial, debe retener el 75% del IVA al pagar a proveedores ordinarios y el 100% a otros contribuyentes especiales. Esta funcionalidad no existe.
- **Base legal:** Providencia SNAT/2005/0056 sobre agentes de retencion del IVA.
- **Estado:** FUNCIONALIDAD FALTANTE — requiere desarrollo
- **Detectado:** 2026-03-21

### OB-006: Sin calculo ni registro del IGTF
- **Modulo:** Inventario / Compras en divisas
- **Problema:** El sistema registra compras en USD pero no calcula ni registra el IGTF (Impuesto a las Grandes Transacciones Financieras) que aplica cuando se paga en divisas. Alicuota vigente: 3%.
- **Base legal:** Ley de IGTF, Art. 3.
- **Estado:** FUNCIONALIDAD FALTANTE
- **Detectado:** 2026-03-21
