# Plan Full Market — Mejoras para Supermercado Full Market C.A.

> Fecha de análisis: 2026-03-20
> Archivo de referencia: `INVENTARIO AGOSTO FULL MARKET 2025 (2).xlsx`
> RIF cliente: J-31549208-3

---

## Contexto del cliente

Full Market es un supermercado con ~845 SKUs distribuidos en 9 departamentos:
`BEBIDAS`, `CIGARROS`, `CONFITERIA`, `EXENTO`, `GRAVABLE`, `LICORES`, `LIMPIEZA`, `PERSONAL`, `VERDURAS`

Su flujo actual es una hoja Excel por mes con:
- Inventario inicial (unidades del período anterior)
- Entradas y salidas del mes
- Costeo en **bolívares o dólares** según proveedor
- Tasa del dólar (BCV) para convertir costos USD → Bs
- Resumen SALDO por departamento con totales de entradas/salidas/existencia

---

## Brechas identificadas

| # | Brecha | Impacto | Esfuerzo estimado |
|---|--------|---------|-------------------|
| 1 | Multi-moneda USD/Bs con tasa de cambio | **Crítico** | Alto |
| 2 | Migración de 845 productos desde Excel | **Crítico** | Medio |
| 3 | Reporte SALDO agrupado por departamento | Alto | Bajo |
| 4 | Markup de venta configurable por departamento | Medio | Bajo |

---

## Fase A — Multi-moneda (USD / Bs con tasa de cambio)

**Por qué:** ~40% de los productos del cliente tienen costo en USD (principalmente BEBIDAS).
La conversión es: `CostoTotalBs = IF(moneda='D', costoFacturaUsd × tasaDolar, costoFacturaBs)`.
Sin esto el sistema no puede representar su inventario correctamente.

**Diseño de datos:**

```
Producto
  moneda_defecto: 'B' | 'D'   -- moneda habitual de compra del producto

InventarioPeriodo (o Cierre)
  tasa_dolar: numeric          -- tasa BCV del período YYYY-MM

Movimiento / FacturaCompraItem
  moneda: 'B' | 'D'
  costo_unitario_moneda: numeric   -- costo en la moneda original
  tasa_dolar_usada: numeric        -- tasa al momento de la operación
  -- costo_unitario (ya existe) sigue siendo siempre en Bs
```

**Decisión clave:** el sistema guarda SIEMPRE el costo en Bs como valor canónico para cálculos de inventario. El costo en USD + la tasa se guardan como referencia histórica (para auditoría y para reproducir el cálculo original).

### Pasos

#### A.1 — Tasa de cambio por período

- [ ] **Migración** — agregar columna `tasa_dolar NUMERIC(12,4)` a `inventario_cierres`; también crear tabla `inventario_tasas` si se quiere una tasa independiente de los cierres
- [ ] **UI en Cierres** — mostrar y editar el campo `tasaDolar` en `cierres/page.tsx`; indicar fuente (BCV oficial)
- [ ] **Hook** — exponer `tasaDolarActual` en `useInventory` resolviendo la tasa del período activo

#### A.2 — Campo moneda en productos

- [ ] **Migración** — agregar columna `moneda_defecto CHAR(1) DEFAULT 'B'` a `inventario_productos`
- [ ] **Dominio** — agregar `monedaDefecto: 'B' | 'D'` a `Producto`
- [ ] **UI productos** — selector "Moneda habitual" en formulario de producto (B=Bolívares / D=Dólares)
- [ ] **CSV import** — agregar columna `moneda_defecto` al template de importación

#### A.3 — Multi-moneda en Facturas de Compra

- [ ] **Migración** — agregar a `inventario_facturas_compra_items`:
  - `moneda CHAR(1) DEFAULT 'B'`
  - `costo_moneda NUMERIC(12,4)` — precio en moneda original
  - `tasa_dolar NUMERIC(12,4)` — tasa usada para conversión
- [ ] **Dominio** — extender `FacturaCompraItem` con los tres campos
- [ ] **UI `FacturaItemsGrid`** — columna "Moneda" con selector B/D; cuando es D mostrar campo "Costo USD" + heredar tasa del período; calcular y mostrar "Costo Bs" en tiempo real
- [ ] **RPC `tenant_inventario_factura_save`** — actualizar para persistir y devolver nuevos campos; el `costo_unitario` que llega al movimiento de inventario siempre debe ser el valor en Bs ya convertido

#### A.4 — Multi-moneda en Movimientos directos (ajustes)

- [ ] **Migración** — mismos campos en `inventario_movimientos`: `moneda`, `costo_moneda`, `tasa_dolar`
- [ ] **UI Movimientos** — selector de moneda + campo costo USD cuando corresponde

---

## Fase B — Migración de Productos desde Excel

**Por qué:** 845 productos con código, nombre, departamento, proveedor, IVA y existencia inicial.
Tipear esto a mano es inviable; necesitan una vía de carga masiva.

**Estrategia:** Mejorar el importador CSV existente para aceptar el formato del cliente
con un paso previo de conversión Excel → CSV.

### Pasos

#### B.1 — Template CSV extendido para productos

Columnas actuales del CSV de productos:
`codigo, nombre, descripcion, tipo, unidad_medida, metodo_valuacion, existencia_minima, costo_promedio, iva_tipo, activo, departamento_nombre`

Columnas a agregar:
`moneda_defecto, existencia_actual, proveedor_nombre`

- [ ] **`parseProductosCsv`** — aceptar las nuevas columnas (`monedaDefecto`, `existenciaActual`, `proveedorNombre` para linkear al proveedor si ya existe)
- [ ] **`SaveProductoUseCase`** — aceptar `existenciaActual` en la creación inicial (genera un movimiento `ajuste_positivo` automático si > 0)
- [ ] **Documentación de mapeo** — tabla clara: columna Excel → columna CSV

#### B.2 — Script de conversión Excel → CSV (opcional)

Si el cliente entrega el Excel directamente, crear una herramienta interna (script Node.js o página de admin) que:
- Lee la hoja `Sheet1` del Excel de Full Market
- Extrae: Codigo → `codigo`, Producto → `nombre`, DEPARTAMENTO → `departamento_nombre`, Proveedor → `proveedor_nombre`, IVA (E/G) → `iva_tipo`, `Inventario Inicial` → `existencia_actual`, `Moneda` → `moneda_defecto`, `Costo Factura` → `costo_promedio`
- Genera el CSV importable

- [ ] Script o página admin `/admin/import-excel-inventario`

#### B.3 — Importación masiva de proveedores primero

Antes de importar productos, los proveedores deben existir.
El Excel contiene los nombres de proveedor por producto → generar CSV de proveedores único.

- [ ] Extraer proveedores únicos del Excel → CSV → importar con el importador existente

---

## Fase C — Reporte SALDO por Departamento

**Por qué:** La hoja SALDO es el reporte mensual que entrega el cliente al contador/SENIAT.
Muestra entradas, salidas y existencia agrupadas por departamento con totales en Bs.

**Formato requerido (de la hoja SALDO):**

| Departamento | Entradas (unid.) | Costo Inicial Bs | Salidas (unid.) | Costo Salidas Bs |
|---|---|---|---|---|
| VIVERES GRAVABLES | 874 | 549,875 | 1,116 | 2,953,388 |
| VIVERES EXENTOS | 1,376 | 984,688 | 572 | 1,079,324 |
| BEBIDAS | 183 | 211,537 | 298 | 379,610 |
| CONFITERIA | 345 | 124,767 | 31 | 57,529 |
| LICORES | 519 | 2,327,337 | 18 | 119,078 |
| PERSONAL | 81 | 33,268 | 158 | 315,823 |
| VERDURAS | 905 | 279,158 | 149 | 163,204 |
| CIGARROS | 111 | 290,284 | 26 | 89,631 |
| LIMPIEZA | 628 | 345,116 | 435 | 1,822,088 |
| **TOTAL** | **4,922** | **5,165,035** | **2,803** | **6,979,680** |

> Nota: los departamentos `EXENTO` y `GRAVABLE` del Excel son en realidad clasificaciones de víveres, no nombres de departamento distintos. En el reporte aparecen como `VIVERES EXENTOS` y `VIVERES GRAVABLES`.

### Pasos

- [x] **RPC `tenant_inventario_reporte_saldo(p_user_id, p_empresa_id, p_periodo)`** — agrupa `reporte_periodo` por `departamento_nombre`, sumando unidades y valores de entradas, salidas, existencia actual y existencia inicial
- [x] **Dominio** — tipo `ReporteSaldoRow`: `{ departamento, unidadesEntradas, costoEntradas, unidadesSalidas, costoSalidas, unidadesExistencia, costoExistencia, unidadesInicial, costoInicial }`
- [x] **UI** — `app/(app)/inventory/reporte-saldo/page.tsx`
  - Selector de período YYYY-MM
  - Tabla por departamento con los totales del cliente
  - Fila de gran total al pie
  - Export CSV y botón imprimir
- [x] **Sidebar** — agregar link "Reporte SALDO"

---

## Fase D — Markup de venta configurable

**Por qué:** En el Excel, `Total Salidas S/IVA = Costo Promedio × 130%` (markup fijo 30%).
El cliente quiere ver el precio de venta estimado sin tener que calcularlo manualmente.

**Alcance acotado:** no es una gestión de precios de venta, solo mostrar el precio estimado
en reportes. El markup puede ser global o por departamento.

### Pasos

- [ ] **Configuración por empresa** — campo `markup_venta_pct NUMERIC DEFAULT 30` en tabla de empresas o como setting de inventario
- [ ] **Reporte de período** — agregar columna `PrecioVentaEstimado = costoPromedio × (1 + markup/100)` en la UI del reporte (no en la DB)
- [ ] **Reporte SALDO** — mostrar columna `Total Salidas S/IVA` calculada con el markup configurado

---

## Orden de ejecución

```
A.1 (tasa de cambio por período)
  → A.2 (moneda en producto)
    → A.3 (moneda en facturas)
      → A.4 (moneda en movimientos)

B.3 (importar proveedores) → B.1 → B.2 (migración masiva)

C (reporte SALDO) — independiente, puede ir después de A

D (markup) — independiente, trivial, va al final
```

### Prioridad para la prueba piloto

| Fase | Prioridad | Bloquea piloto |
|------|-----------|----------------|
| A — Multi-moneda | **P1** | Sí — sin esto los costos son incorrectos |
| B — Migración Excel | **P1** | Sí — necesitan cargar sus 845 productos |
| C — Reporte SALDO | P2 | No, pero es el reporte que usan cada mes |
| D — Markup | P3 | No |

---

## Dependencias con INVENTARIO_PLAN.md

Las fases A-D son **aditivas** y no bloquean ni son bloqueadas por las fases 1-8 del plan regulatorio.
La única intersección es:

- **Fase A.3** modifica `FacturaCompraItem` — coordinar con Fase 7 del plan regulatorio (múltiples tasas IVA) para no hacer dos migraciones sobre la misma tabla.
- **Fase C** el reporte SALDO puede reutilizar la infraestructura del `reporte-periodo` existente (solo es un agrupado diferente).
