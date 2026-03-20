# Plan de Ataque — Inventario Venezuela (KONT)

> Fecha: 2026-03-20
> Base legal: Código de Comercio, Reglamento ISLR Art. 177, Ley IVA + Reglamento, Providencia 0071 SENIAT, VEN-NIF / NIC 2

---

## Estado actual (ya implementado)

| Feature | Estado |
|---|---|
| Productos (CRUD, tipos, método valuación PEPS/promedio) | ✅ |
| Movimientos (entrada/salida/ajuste/autoconsumo) | ✅ |
| Kardex por producto | ✅ |
| Facturas de Compra (borrador → confirmada) con IVA | ✅ |
| Transformaciones (materia prima → producto terminado) | ✅ |
| Proveedores (CRUD) | ✅ |
| Cierres de período | ✅ |
| Departamentos | ✅ |
| Reporte de período (CTE) | ✅ |
| `iva_tipo` por producto (exento/general) | ✅ |

---

## Fases de implementación

### Fase 1 — Número de Control en Facturas

**Por qué:** La Providencia SENIAT 0071 exige `numero_control` (asignado por imprenta autorizada) en toda factura fiscal. Sin él, el crédito fiscal de IVA no es recuperable ante SENIAT.
**Bloquea:** Fase 2 (Libro de Compras muestra este campo).
**Dependencias:** ninguna.

#### Pasos

- [ ] **Migración 016** — agregar columna `numero_control TEXT` a `inventario_facturas_compra`; actualizar RPCs `tenant_inventario_factura_save` y `tenant_inventario_factura_get` para incluirla
- [ ] **Dominio** — agregar `numeroControl?: string` a la interfaz `FacturaCompra` (`src/modules/inventory/backend/domain/factura-compra.ts`)
- [ ] **Repositorio** — mapear el campo en `rpc-factura-compra.repository.ts`
- [ ] **UI** — agregar campo "Número de Control" en `compras/nueva/page.tsx` y `compras/[id]/page.tsx` (editable solo en estado borrador)

---

### Fase 2 — Libro de Compras IVA

**Por qué:** El Reglamento de la Ley de IVA Art. 70–72 exige un registro mensual de compras en formato específico, disponible para fiscalización SENIAT en cualquier momento.
**Dependencias:** Fase 1 (necesita `numeroControl`).
**Bloquea:** nada.

#### Pasos

- [ ] **Migración 017** — nuevo RPC `tenant_inventario_libro_compras(p_empresa_id, p_periodo TEXT)` que consulta facturas confirmadas del período, con joins a items + productos para separar base gravada (16%) de base exenta
- [ ] **Dominio** — nuevo archivo `src/modules/inventory/backend/domain/libro-compras.ts`
  - Tipo `LibroComprasRow`: `{ fecha, numeroFactura, numeroControl, proveedorRif, proveedorNombre, baseGravada, ivaGeneral, baseExenta, total }`
  - Interfaz `ILibroComprasRepository`
- [ ] **Use Case** — `src/modules/inventory/backend/app/get-libro-compras.use-case.ts`
- [ ] **Repositorio** — `src/modules/inventory/backend/infra/repository/rpc-libro-compras.repository.ts`
- [ ] **Factory** — agregar `getLibroCompras` a `getInventoryActions` en `inventory-factory.ts`
- [ ] **API** — `app/api/inventory/libro-compras/route.ts` (GET con query `?periodo=YYYY-MM&empresaId=...`)
- [ ] **Hook** — agregar `libroCompras`, `loadingLibroCompras`, `loadLibroCompras` a `useInventory`
- [ ] **UI** — `app/(app)/inventory/libro-compras/page.tsx`
  - Selector de período (YYYY-MM)
  - Tabla: fecha | n° factura | n° control | RIF proveedor | nombre proveedor | base gravada | IVA 16% | base exenta | total
  - Fila de totales mensuales al pie
  - Exportación CSV
- [ ] **Sidebar** — agregar link en `src/shared/frontend/components/app-sidebar.tsx`

---

### Fase 3 — Reporte Art. 177 ISLR

**Por qué:** El Reglamento de la Ley de ISLR Art. 177 obliga a mantener un registro mensual detallado por producto (unidades + valores de cada entrada y salida), que SENIAT puede exigir en una fiscalización.
**Dependencias:** ninguna (reutiliza infraestructura existente de kardex/movimientos).
**Bloquea:** nada.

#### Pasos

- [ ] **Análisis** — verificar si el kardex existente (`/api/inventory/kardex`) devuelve saldo de apertura del período; si no, crear RPC `tenant_inventario_kardex_periodo(p_empresa_id, p_periodo)` que calcule saldo inicial, movimientos del mes y saldo final
- [ ] **Migración 018 (condicional)** — solo si se necesita RPC nuevo para saldo de apertura por período
- [ ] **UI** — `app/(app)/inventory/reporte-islr/page.tsx`
  - Selector de período
  - Por cada producto con movimientos en el período: tabla detallada
    - Columnas: fecha | referencia | tipo de movimiento | cant. entrada | cant. salida | saldo cantidad | costo entrada | costo salida | saldo costo
  - Fila de saldo inicial (antes del período)
  - Subtotales por producto + gran total
  - Botón de impresión y exportación CSV
- [ ] **Sidebar** — agregar link

---

### Fase 4 — Autoconsumo Workflow Completo

**Por qué:** El autoconsumo (retiro de bienes) es un hecho imponible del IVA (Ley IVA); el contribuyente debe emitir una factura interna, registrar el débito fiscal, y separarlo en una columna especial del Libro de Ventas.
**Dependencias:** ninguna.
**Bloquea:** Fase 5 (Libro de Ventas incluye autoconsumos).

#### Pasos

- [ ] **UI en movimientos** — sección o modal dedicado "Registrar Autoconsumo" en `movimientos/page.tsx`
  - Selector de producto (muestra `costoPromedio` e `ivaTipo` actuales)
  - Campo cantidad + campo motivo/notas
  - Preview: costo total retirado + IVA generado (débito fiscal al 16% si `ivaTipo === 'general'`)
  - Advertencia visible: "Esta operación genera un débito fiscal de IVA"
- [ ] **Backend** — validación en `save-movimiento` use case: cantidad no debe superar existencia actual
- [ ] **Pantalla de confirmación** — resumen antes de guardar destacando el monto de IVA generado

---

### Fase 5 — Salidas por Venta + Libro de Ventas IVA

**Por qué:** Las salidas_venta actuales son movimientos sin documento. Para el Libro de Ventas IVA (obligatorio) se necesita: RIF del cliente, número de factura emitida, precio de venta e IVA cobrado. Los autoconsumos también van en una columna especial del Libro de Ventas.
**Dependencias:** Fase 4 (autoconsumos ya deben estar registrando IVA).
**Bloquea:** nada.

#### Pasos

- [ ] **Migración 019** — agregar columnas a `inventario_movimientos` (nullable, solo para salida_venta y autoconsumo): `numero_factura_venta`, `cliente_rif`, `cliente_nombre`, `precio_venta_unitario`, `iva_venta_monto`; actualizar RPCs de movimiento
- [ ] **Dominio** — extender `Movimiento` con campos opcionales de venta
- [ ] **Repositorio** — actualizar `rpc-movimiento.repository.ts` para mapear nuevos campos
- [ ] **UI "Nota de Despacho"** — formulario en `movimientos/page.tsx` o página separada `ventas/page.tsx`
  - Campos: RIF cliente, nombre cliente, n° factura de venta, fecha
  - Multi-línea: producto, cantidad, precio unitario de venta, alícuota IVA
  - Genera movimientos `salida_venta` con todos los campos
- [ ] **Libro de Ventas** — `app/(app)/inventory/libro-ventas/page.tsx`
  - Selector de período
  - Tabla: fecha | n° factura | RIF cliente | nombre cliente | base gravada | IVA 16% | base exenta | autoconsumos | total
  - Fila de totales + resumen débito fiscal del mes
  - CSV export
- [ ] **Sidebar** — agregar links

---

### Fase 6 — Devoluciones UI

**Por qué:** Los tipos `devolucion_compra` y `devolucion_venta` ya existen en el dominio pero no tienen flujo de UI. Las devoluciones afectan stock, IVA (nota de crédito) y el Libro de Compras/Ventas.
**Dependencias:** Fase 1 (facturas), Fase 5 (ventas).
**Bloquea:** nada.

#### Pasos

- [ ] **Devolución de compra** — botón "Registrar Devolución" en `compras/[id]/page.tsx` (solo facturas confirmadas)
  - Modal: seleccionar items y cantidades a devolver
  - Genera movimientos `devolucion_compra` que descuentan stock
  - Asocia la devolución a la factura original (`referencia`)
- [ ] **Devolución de venta** — botón o sección en Libro de Ventas
  - Genera movimientos `devolucion_venta` que incrementan stock
  - Captura nota de crédito del cliente

---

### Fase 7 — Múltiples Tasas de IVA en Facturas

**Por qué:** Venezuela maneja tres alícuotas: 16% (general), 8% (reducida, bienes esenciales), 0%/exenta (exportaciones). La factura debe discriminar el IVA por tasa; el Libro de Compras separa por alícuota.
**Dependencias:** ninguna (mejor ejecutar antes de que haya muchos datos históricos).
**Bloquea:** nada.

#### Pasos

- [ ] **Migración 020** — agregar columna `iva_alicuota` a `inventario_facturas_compra_items`: enum `('exenta', 'reducida_8', 'general_16')`; mantener `iva_porcentaje` en header como default
- [ ] **Dominio** — agregar `ivaAlicuota: 'exenta' | 'reducida_8' | 'general_16'` a `FacturaCompraItem`
- [ ] **UI** — en `FacturaItemsGrid`, selector de alícuota por línea de item
- [ ] **Resumen de factura** — totales separados: base exenta | base 8% + IVA 8% | base 16% + IVA 16%
- [ ] **Libro de Compras** — actualizar RPC y columnas UI para desglosar por tasa

---

### Fase 8 — Libro de Inventarios Anual (ISLR)

**Por qué:** El Código de Comercio Art. 36 exige un Libro de Inventarios al cierre del ejercicio fiscal. Además, la declaración anual de ISLR requiere: inventario inicial + compras − inventario final = Costo de Ventas deducible.
**Dependencias:** ninguna.
**Bloquea:** nada.

#### Pasos

- [ ] **Migración 021** — nuevo RPC `tenant_inventario_libro_inventarios(p_empresa_id, p_anio INT)` que calcula por producto: saldo inicial al 01/01, entradas del año, salidas del año, saldo final al 31/12 (en unidades y VES)
- [ ] **UI** — `app/(app)/inventory/libro-inventarios/page.tsx`
  - Selector de año
  - Tabla: código | producto | tipo | unidad | cant. inicial | valor inicial | entradas | salidas | cant. final | valor final
  - Resumen ISLR: inventario inicial total + compras del año − inventario final = **Costo de Ventas**
  - Export CSV / botón de impresión
- [ ] **Sidebar** — agregar link

---

## Orden de ejecución

```
Fase 1 → Fase 2
              ↘
               Fase 3 (independiente, puede ir en paralelo)
               Fase 4 → Fase 5
               Fase 6 (depende de 1 y 5)
               Fase 7 (independiente, mejor temprano)
               Fase 8 (independiente)
```

### Prioridad legal

| Fase | Obligatoriedad | Base legal |
|---|---|---|
| 1 — Número de Control | **Obligatorio** | Providencia SENIAT 0071 |
| 2 — Libro de Compras IVA | **Obligatorio** | Reglamento IVA Art. 70–72 |
| 3 — Reporte Art. 177 ISLR | **Obligatorio** | Reglamento ISLR Art. 177 |
| 4 — Autoconsumo workflow | **Obligatorio** | Ley IVA (hecho imponible) |
| 5 — Ventas + Libro de Ventas | Importante | Reglamento IVA Art. 70–72 |
| 6 — Devoluciones UI | Importante | Buenas prácticas / IVA |
| 7 — Múltiples tasas IVA | Importante | Ley IVA |
| 8 — Libro de Inventarios | Importante | Código de Comercio Art. 36 |

---

## Features fuera de alcance (backlog)

- **Retenciones IVA** — para Contribuyentes Especiales (retención 75%/100% al proveedor)
- **Ajuste físico de inventario** — carga masiva de conteo físico vs sistema
- **Notas de Crédito de proveedores** — documento complementario a facturas
- **Costeo completo de producción** — mano de obra directa + costos indirectos en Transformaciones
- **Dashboard mejorado** — alertas stock mínimo, valor inventario en USD/VES, crédito fiscal acumulado del mes
