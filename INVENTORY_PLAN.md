# Plan de Ataque — Módulo de Inventario
**Fecha:** 2026-03-21
**Basado en:** Análisis de requerimientos faltantes (req-contadora-venezolana)

---

## Estado actual del sistema

El módulo tiene una base sólida implementada:
- Productos con tipos, unidades, método de valuación promedio ponderado, IVA, moneda, departamento
- Factura de compra: borrador → confirmación, multi-alícuota (exenta/8%/16%), multi-moneda USD/Bs con tasa BCV, número de control
- Tipos de movimiento: entrada_compra, salida_venta, entrada/salida_produccion, ajuste +/-, devolucion_compra, devolucion_venta, autoconsumo
- Ventas con RIF cliente, nombre, número de factura, IVA calculado
- Libros fiscales: Compras (con desglose por alícuota), Ventas, Inventarios anual, ISLR, Saldo
- Kardex, reportes por período, exportación CSV
- Cierres con tasa BCV automática, bloqueo en períodos cerrados
- Producción/transformación de materias primas

---

## Deuda técnica a resolver ANTES de los nuevos reqs

Dos problemas que bloquean o encarecen varios requerimientos si no se resuelven primero:

### DT-1 — Libro de Ventas sin desglose de IVA por alícuota
El `LibroVentasRow` tiene `baseGravada` como campo único (asume 16% para todo). El Libro de Compras sí desglosa correctamente (`baseGravada8`, `iva8`, `baseGravada16`, `iva16`). El Libro de Ventas debe homologarse.

**Archivos afectados:**
- `supabase/migrations/027_inventory_libro_ventas_multitasa.sql`
- `src/modules/inventory/backend/domain/libro-ventas.ts`
- `src/modules/inventory/backend/infra/repository/rpc-libro-ventas.repository.ts`
- `app/(app)/inventory/libro-ventas/page.tsx`

### DT-2 — `Company` no tiene campos de configuración fiscal
Los REQ-INV-001, 003, 004 y 006 necesitan campos en la empresa. Agregar columna `config_fiscal` JSONB a `companies` con claves:
```json
{
  "es_contribuyente_especial": false,
  "porcentaje_retencion_iva": 75,
  "numero_control_siguiente": 1,
  "numero_retencion_siguiente": 1,
  "tabla_islr": [],
  "contabilidad_activa": false
}
```
Usar JSONB permite agregar claves sin nuevas migraciones por cada requerimiento.

**Archivos afectados:**
- `supabase/migrations/027_companies_config_fiscal.sql` (o número siguiente)
- Dominio `company.ts`

---

## Fase 0 — Deuda técnica base
**~2 días | Prerequisito para Fase 1**

| Tarea | Complejidad |
|-------|------------|
| DT-1: Desglose IVA por alícuota en Libro de Ventas | S |
| DT-2: Columna `config_fiscal` JSONB en `companies` | S |

---

## Fase 1 — Obligaciones fiscales críticas
**~8 días | Semanas 1-2**

Son los requerimientos que generan sanciones del SENIAT si no están. Se implementan juntos porque comparten el campo `es_contribuyente_especial` de la empresa.

---

### REQ-INV-001 — Retenciones de IVA en compras para contribuyentes especiales
**Complejidad: M | ~3 días**

**Contexto legal:** Providencia SNAT/2005/0056 (G.O. N° 38.136). Contribuyentes especiales retienen 75% del IVA si el proveedor es ordinario, 100% si es especial.

**Diseño:**
- Nuevos campos en `inventario_facturas_compra`: `retencion_iva_porcentaje` (75/100), `retencion_iva_monto`
- La retención se calcula al confirmar: `retencion_iva = iva_total × porcentaje / 100`
- El formulario de compra muestra el cálculo solo si la empresa es contribuyente especial

**Archivos a crear/modificar:**
- `supabase/migrations/028_inventory_retencion_iva.sql` — ALTER TABLE + actualizar RPCs
- `src/modules/inventory/backend/domain/factura-compra.ts` — campos retencion iva
- `src/modules/inventory/backend/domain/libro-compras.ts` — columnas retención
- `src/modules/inventory/backend/infra/repository/rpc-factura-compra.repository.ts`
- `src/modules/inventory/backend/infra/repository/rpc-libro-compras.repository.ts`
- `app/(app)/inventory/compras/nueva/page.tsx` — mostrar cálculo retención
- `app/(app)/inventory/libro-compras/page.tsx` — columna retención

**Criterios de aceptación:**
- [ ] Campo "Tipo de contribuyente" en configuración de empresa
- [ ] Al registrar compra siendo contribuyente especial, se muestra campo "Proveedor es contribuyente especial"
- [ ] Sistema calcula automáticamente IVA retenido
- [ ] Desglose visible: IVA facturado / IVA retenido / neto a pagar al proveedor
- [ ] Libro de Compras incluye columna "IVA Retenido"
- [ ] Si la empresa es ordinaria, columnas de retención no aparecen

---

### REQ-INV-004 — Número de control en facturas de venta
**Complejidad: S | ~2 días**

**Contexto legal:** Providencia SNAT/2011/00071 (G.O. N° 39.795), Art. 13. Obligatorio, 8 dígitos, correlativo por empresa y ejercicio fiscal.

**Diseño:**
- El número de control se genera 100% en el RPC de venta (UPDATE ... RETURNING) para evitar duplicados
- Contador en `config_fiscal.numero_control_siguiente` por empresa
- Los movimientos históricos quedan con el campo nullable ("Pendiente" en UI)

**Archivos a crear/modificar:**
- `supabase/migrations/029_inventory_numero_control_venta.sql` — campo en movimientos + función atómica
- `src/modules/inventory/backend/domain/movimiento.ts` — agregar `numeroControlVenta?: string`
- `app/api/inventory/ventas/route.ts`
- `app/(app)/inventory/ventas/page.tsx` — mostrar número de control
- `app/(app)/inventory/libro-ventas/page.tsx` — columna N° Control

**Criterios de aceptación:**
- [ ] Campo "Número de Control" visible en formulario de venta (asignado automáticamente)
- [ ] El sistema lleva contador por empresa, reiniciable para inicio de ejercicio fiscal
- [ ] No pueden existir dos ventas con el mismo número de control en el mismo ejercicio
- [ ] Libro de Ventas muestra columna "N° Control"

---

### REQ-INV-002 — Comprobante y Libro de Retenciones de IVA (Forma 35)
**Complejidad: L | ~4 días**

**Contexto legal:** Providencia SNAT/2005/0056, Arts. 15, 16 y 18. El contribuyente especial debe entregar comprobante al proveedor y presentar relación al SENIAT quincenalmente.

**Diseño:**
- Nueva sección "Retenciones" en sidebar
- El libro es una vista filtrada de facturas confirmadas donde `retencion_iva_monto > 0`
- PDF de comprobante generado client-side con datos de empresa + proveedor + retención

**Archivos a crear:**
- `supabase/migrations/030_inventory_libro_retenciones.sql` — RPC `tenant_inventario_libro_retenciones`
- `src/modules/inventory/backend/domain/libro-retenciones.ts`
- `src/modules/inventory/backend/domain/repository/libro-retenciones.repository.ts`
- `src/modules/inventory/backend/app/get-libro-retenciones.use-case.ts`
- `src/modules/inventory/backend/infra/repository/rpc-libro-retenciones.repository.ts`
- `app/api/inventory/libro-retenciones/route.ts`
- `app/(app)/inventory/libro-retenciones/page.tsx`
- Actualizar `inventory-factory.ts`, `use-inventory.ts`, `app-sidebar.tsx`

**Criterios de aceptación:**
- [ ] Página "Libro de Retenciones IVA" filtrable por período
- [ ] Columnas: fecha, RIF proveedor, proveedor, N° factura, N° control, base, alícuota, IVA facturado, % retención, IVA retenido, período enteramiento
- [ ] Desde una factura con retención, botón "Comprobante de retención" genera PDF
- [ ] PDF incluye todos los campos del Art. 18 de la Providencia
- [ ] Exportación CSV disponible
- [ ] Total del libro coincide con suma de retenciones del período

---

### REQ-INV-003 — Retenciones de ISLR sobre pagos a proveedores
**Complejidad: L | ~3 días**

**Contexto legal:** Decreto 1.808 (G.O. N° 36.203, 1997). Aplica a pagos de servicios (transporte 1%, honorarios 3%, publicidad 3%, arrendamiento 5%, construcción 1%). Base de cálculo: subtotal sin IVA.

**Diseño:**
- Campo opcional en `FacturaCompra`: `retencionIslrPorcentaje`, `retencionIslrMonto`
- Tabla de conceptos configurable en `config_fiscal.tabla_islr` (predefinida, editable)
- En formulario de compra: selector opcional "Concepto ISLR" que precarga el porcentaje

**Archivos a crear/modificar:**
- `supabase/migrations/031_inventory_retencion_islr.sql`
- `src/modules/inventory/backend/domain/factura-compra.ts` — campos ISLR
- `app/(app)/inventory/compras/nueva/page.tsx` — selector concepto ISLR (colapsable)

**Criterios de aceptación:**
- [ ] Sección "Retención ISLR (opcional)" en formulario de compra
- [ ] Selector de concepto con porcentaje precargado (configurable)
- [ ] Cálculo automático: `ISLR = Subtotal × %`
- [ ] El monto no afecta el costo del inventario
- [ ] Reporte "Retenciones ISLR practicadas" por período con exportación CSV

---

## Fase 2 — Documentos de venta formales
**~5 días | Semana 3**

---

### REQ-INV-005 — Nota de crédito de ventas con efecto fiscal
**Complejidad: L | ~3 días**

**Contexto legal:** Reglamento de la Ley del IVA, Art. 58. Providencia SNAT/2011/00071, Art. 16. La nota de crédito debe referenciar la factura original y aparecer como línea negativa en el Libro de Ventas.

**Diseño:**
- Nuevo tipo de movimiento: `nota_credito_venta`
- Referencia obligatoria a la factura original (`numeroFacturaOriginal`)
- En Libro de Ventas: fila con valores negativos, reduce la base gravada y débito fiscal del período

**Archivos a crear/modificar:**
- `supabase/migrations/032_inventory_nota_credito.sql` — ALTER CHECK constraint + actualizar RPC libro_ventas
- `src/modules/inventory/backend/domain/movimiento.ts` — tipo `nota_credito_venta`
- `src/modules/inventory/backend/domain/libro-ventas.ts` — tipo `'nota_credito'` con montos negativos
- `app/(app)/inventory/ventas/page.tsx` — formulario de nota de crédito
- `app/(app)/inventory/libro-ventas/page.tsx` — filas de nota de crédito en rojo

**Decisión de diseño pendiente:** ¿La nota de crédito devuelve stock (como devolucion_venta) o es solo ajuste fiscal? Son dos flujos distintos — confirmar con el cliente antes de implementar.

**Criterios de aceptación:**
- [ ] Al registrar una devolución de venta, el sistema ofrece generar nota de crédito
- [ ] La nota de crédito tiene número correlativo propio
- [ ] Campo "Factura de referencia" obligatorio
- [ ] Libro de Ventas incluye notas de crédito como filas negativas
- [ ] Subtotal del libro refleja ventas netas (ventas − notas de crédito)
- [ ] PDF de la nota de crédito descargable

---

### REQ-INV-009 — Exportación PDF de libros fiscales con membrete
**Complejidad: M | ~2 días**

**Contexto legal:** Código de Comercio Art. 32. Reglamento de la Ley del IVA, Art. 70. El SENIAT pide libros impresos en fiscalizaciones.

**Diseño:**
- Utilitario transversal `inventory-pdf.ts` que recibe datos del libro + empresa
- Encabezado: razón social, RIF, período (formato "Enero 2026")
- Valores en formato `es-VE` (1.234.567,89)
- Orientación automática: landscape para Libro de Compras/Ventas (11 columnas), portrait para reportes menores
- Fila de totales al pie

**Archivos a crear:**
- `src/modules/inventory/frontend/utils/inventory-pdf.ts`
- Botón "PDF" en: `libro-compras/page.tsx`, `libro-ventas/page.tsx`, `libro-retenciones/page.tsx`, `libro-inventarios/page.tsx`, `reporte-saldo/page.tsx`

**Criterios de aceptación:**
- [ ] Botón "PDF" visible junto al botón "CSV" en todos los libros
- [ ] PDF incluye razón social, RIF y período en encabezado
- [ ] Formato numérico es-VE
- [ ] Total del PDF coincide exactamente con el total en pantalla
- [ ] Imprimible en carta horizontal/vertical según columnas

---

## Fase 3 — Catálogos y precios
**~5 días | Semana 4**

---

### REQ-INV-007 — Catálogo de clientes reutilizable
**Complejidad: M | ~3 días**

**Contexto legal:** Providencia SNAT/2011/00071, Art. 14. Un RIF incorrecto del cliente en el Libro de Ventas le impide recuperar su crédito fiscal ante el SENIAT.

**Diseño:** Sigue exactamente el patrón de `inventario_proveedores`. Backfill opcional de clientes únicos desde movimientos existentes en la migración.

**Archivos a crear:**
- `supabase/migrations/033_inventory_clientes.sql` — tabla + RPC CRUD
- `src/modules/inventory/backend/domain/cliente.ts`
- `src/modules/inventory/backend/domain/repository/cliente.repository.ts`
- `src/modules/inventory/backend/app/get-clientes.use-case.ts`
- `src/modules/inventory/backend/app/save-cliente.use-case.ts`
- `src/modules/inventory/backend/app/delete-cliente.use-case.ts`
- `src/modules/inventory/backend/infra/repository/rpc-cliente.repository.ts`
- `app/api/inventory/clientes/route.ts`, `app/api/inventory/clientes/[id]/route.ts`
- `app/(app)/inventory/clientes/page.tsx`
- Actualizar `use-inventory.ts`, `inventory-factory.ts`, `app-sidebar.tsx`
- `app/(app)/inventory/ventas/page.tsx` — selector cliente con autocomplete

**Criterios de aceptación:**
- [ ] CRUD completo de clientes
- [ ] Búsqueda en tiempo real por RIF o nombre en formulario de venta
- [ ] Al seleccionar cliente del catálogo, se precargan RIF y nombre (editables)
- [ ] Opción "Nuevo cliente" inline sin abandonar la pantalla de venta
- [ ] Importación/exportación CSV
- [ ] Cliente especial "Consumidor Final" con RIF genérico configurable
- [ ] El catálogo es opt-in — funciona igual sin él

---

### REQ-INV-008 — Precio de venta configurable por producto
**Complejidad: M | ~2 días**

**Contexto legal:** Ley Orgánica de Precios Justos, Arts. 31-35. Providencia SNAT/2011/00071, Art. 13 (precio unitario en factura). El sistema debe mostrar el margen calculado para verificar cumplimiento SUNDDE.

**Diseño:**
- Nuevos campos en `inventario_productos`: `precio_venta`, `precio_venta_usd`
- En formulario de venta: precio precargado desde producto, editable por transacción
- Actualización masiva por porcentaje filtrable por departamento

**Archivos a crear/modificar:**
- `supabase/migrations/034_inventory_precio_venta.sql`
- `src/modules/inventory/backend/domain/producto.ts` — `precioVenta?: number`, `precioVentaUsd?: number`
- `src/modules/inventory/backend/infra/repository/rpc-producto.repository.ts`
- `app/(app)/inventory/productos/page.tsx` — columna precio venta + botón actualización masiva
- `app/(app)/inventory/ventas/page.tsx` — precargar precio desde producto
- `src/modules/inventory/frontend/utils/inventory-csv.ts` — agregar precio_venta al CSV

**Criterios de aceptación:**
- [ ] Campos precio de venta en formulario y catálogo de productos
- [ ] Precio precargado al seleccionar producto en venta (editable)
- [ ] Margen de ganancia visible en catálogo de productos (precio venta vs. costo promedio)
- [ ] Actualización masiva de precios por porcentaje con confirmación explícita
- [ ] Precio en CSV de productos

---

## Fase 4 — Operaciones de stock
**~7 días | Semana 5**

---

### REQ-INV-010 — Alertas operativas de stock mínimo
**Complejidad: S | ~1 día**

El dashboard ya computa `bajoMinimo`. Solo falta la pantalla accionable.

**Archivos a crear/modificar:**
- `app/(app)/inventory/alertas/page.tsx` — lista filtrable con columnas: código, nombre, departamento, existencia actual, mínimo, diferencia
- `app/(app)/inventory/page.tsx` — KPI "Bajo mínimo" como link a la página de alertas
- `src/shared/frontend/components/app-sidebar.tsx` — badge de conteo

**Criterios de aceptación:**
- [ ] KPI "Bajo mínimo" en dashboard es un enlace a la lista
- [ ] Lista muestra código, nombre, departamento, existencia actual, mínimo, diferencia
- [ ] Lista exportable en CSV
- [ ] Al registrar venta que deja existencia bajo el mínimo (pero sobre cero), se muestra advertencia (no bloqueo)

---

### REQ-INV-012 — Historial de precios de compra por producto
**Complejidad: S | ~1 día**

Los datos ya existen en movimientos `entrada_compra`. Solo es una vista diferente del kardex.

**Implementación:** Pestaña "Historial de precios" en la página de kardex filtrando por `tipo = 'entrada_compra'`, mostrando: fecha, cantidad, costo unitario Bs, moneda original, costo en moneda original, tasa usada.

**Criterios de aceptación:**
- [ ] Vista "Historial de precios de compra" accesible desde kardex o ficha de producto
- [ ] Columnas: fecha, cantidad, costo unitario Bs, moneda, costo moneda original, tasa
- [ ] Filtrable por rango de fechas
- [ ] Exportable en CSV

---

### REQ-INV-011 — Toma de inventario físico con conciliación
**Complejidad: XL | ~5 días**

**Contexto legal:** VEN-NIF PYME Sección 13.19. Ley de ISLR, Art. 95 (inventario al cierre del ejercicio).

**Diseño (wizard de 3 pasos):**
1. Exportar CSV con: código, nombre, departamento, existencia en sistema, columna vacía "contado_fisico"
2. Importar CSV con cantidades físicas completadas
3. Tabla de diferencias → aprobar lote de ajustes masivos

**Reglas críticas:**
- La conciliación se ejecuta como transacción atómica
- Ajustes marcados con tipo `toma_inventario_{fecha}`
- No permitido en período cerrado
- Costo del ajuste al costo promedio actual

**Archivos a crear:**
- `supabase/migrations/035_inventory_fisico.sql` — tabla `inventario_tomas_fisicas` + tabla `inventario_tomas_fisicas_items` + RPC de conciliación
- `src/modules/inventory/backend/domain/toma-fisica.ts`
- Repositorio, caso de uso
- `app/(app)/inventory/toma-fisica/page.tsx` — wizard 3 pasos
- `src/modules/inventory/frontend/utils/inventory-csv.ts` — funciones para toma física

**Criterios de aceptación:**
- [ ] Página "Toma de Inventario" con wizard de 3 pasos
- [ ] CSV de conteo generado con todos los productos activos
- [ ] Importación CSV con conteos calcula diferencias automáticamente
- [ ] Tabla muestra solo productos con discrepancia
- [ ] Aprobación del lote genera todos los ajustes en una sola operación
- [ ] Ajustes aparecen en kardex con referencia a la toma de inventario
- [ ] Operación falla si el período está cerrado

---

## Fase 5 — Integración con contabilidad
**~8 días | Planificación separada**

### REQ-INV-006 — Asientos automáticos inventario → contabilidad
**Complejidad: XL**

Depende de todas las fases anteriores y del módulo de contabilidad. Debe planificarse en sesión separada con el cliente para definir el plan de cuentas mínimo.

**Aproximación pragmática:** Generar los asientos como JSON estructurado primero (pantalla "Vista previa de asientos") sin persistirlos en el mayor, para validar la lógica antes de construir la integración completa.

**Asiento por confirmación de compra:**
```
DB: Inventario                     XXX
DB: IVA Crédito Fiscal             XXX
  CR: Cuentas por Pagar           XXX
```

**Asiento por venta:**
```
DB: Caja / Cuentas por Cobrar     XXX
  CR: Ventas                      XXX
  CR: IVA Débito Fiscal           XXX
DB: Costo de Ventas               XXX
  CR: Inventario                  XXX
```

**Implementación:** Como patrón opcional (`if contabilidad_activa en config_fiscal`) para no romper empresas que no usan contabilidad.

---

## Resumen de estimaciones

| REQ | Título | Complejidad | Días | Fase |
|-----|--------|------------|------|------|
| DT-1 | Desglose IVA Libro Ventas | S | 1 | 0 |
| DT-2 | config_fiscal en companies | S | 1 | 0 |
| REQ-INV-001 | Retenciones IVA compras | M | 3 | 1 |
| REQ-INV-004 | N° control facturas venta | S | 2 | 1 |
| REQ-INV-002 | Libro/Comprobante retenciones | L | 4 | 1 |
| REQ-INV-003 | Retenciones ISLR proveedores | L | 3 | 1 |
| REQ-INV-005 | Nota de crédito ventas | L | 3 | 2 |
| REQ-INV-009 | PDF libros con membrete | M | 2 | 2 |
| REQ-INV-007 | Catálogo clientes | M | 3 | 3 |
| REQ-INV-008 | Precio venta por producto | M | 2 | 3 |
| REQ-INV-010 | Alertas stock mínimo | S | 1 | 4 |
| REQ-INV-012 | Historial precios compra | S | 1 | 4 |
| REQ-INV-011 | Toma de inventario físico | XL | 5 | 4 |
| REQ-INV-006 | Integración contabilidad | XL | 8+ | 5 |
| **Total** | | | **~39 días** | |

---

## Riesgos técnicos

### R1 — Migraciones en tenant multi-schema
Cada migración debe incluir el bloque `DO $$ FOR r IN SELECT schema_name FROM public.tenants LOOP` y actualizar `provision_tenant_schema`. Si se omite, los tenants existentes quedan desincronizados.
**Referencia:** Ver patrón en `supabase/migrations/026_inventory_factura_delete_confirmed.sql`.

### R2 — Número de control como secuencia atómica
El campo `numero_control_siguiente` debe actualizarse con `UPDATE ... RETURNING` dentro de la misma transacción que crea el movimiento de venta. Si se hace en dos llamadas separadas (leer en frontend, enviar al backend), pueden generarse huecos o duplicados.
**Regla:** La lógica de asignación del número de control debe vivir 100% en el RPC de venta.

### R3 — CHECK constraint en `inventario_movimientos.tipo`
Los REQ-INV-005 y REQ-INV-011 requieren nuevos valores en el CHECK constraint del campo `tipo`. En PostgreSQL esto requiere `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT`. Hacer en la misma transacción, verificar que no haya datos que incumplan la nueva constraint.

### R4 — `useInventory` monolítico (636 líneas, 30+ callbacks)
Agregar clientes, toma física y contabilidad lo hará inmanejable. Evaluar dividir en hooks especializados (`useInventoryCompras`, `useInventoryVentas`, `useInventoryCatalogos`) antes de Fase 3.

### R5 — REQ-INV-006 toca RPCs con muchos dependientes
Los RPCs `tenant_inventario_factura_confirmar` y el RPC de movimientos deben extenderse para generar asientos. Implementar como patrón de eventos opcionales (`if contabilidad_activa`) para no romper usuarios que no usan contabilidad.

---

## Observaciones adicionales sobre el código existente

1. **Libro de Ventas sin desglose por alícuota** — `LibroVentasRow` tiene `baseGravada` único. Debe homologarse al Libro de Compras que sí desglosa por 8%/16%/exenta. Corregido en Fase 0 (DT-1).

2. **Eliminación de facturas confirmadas sin traza de auditoría** — El sistema advierte pero permite eliminar. La práctica correcta: facturas confirmadas no eliminables una vez cerrado el período. En período abierto, permitir eliminación pero registrar en log de auditoría. Implementar en paralelo con la Fase 1 como mejora menor.
