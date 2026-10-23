# Plan de rediseño Web del módulo IVA

Fecha: 2026-10-22. Estado: cerrado en dev el 2026-10-23 (ver «Cierre de pendientes»); el conciliador visual pasa al plan de Compras y producción sigue sin aplicar. Ejecutor: Codex.

Alcance: rediseñar la experiencia Web de IVA alrededor del **período fiscal**, agrupar sus pantallas bajo `/fiscal/*` y completar los contratos de lectura que la nueva interfaz necesita. Complementa (no reemplaza) [PLAN_INTEGRACION_IVA](PLAN_INTEGRACION_IVA.md), que sigue siendo la fuente de verdad sobre reglas tributarias, emisión atómica y Forma IVA 30. Casos de uso: `ProfitPlus_CasosDeUso_Modulos_COMPLETO/11_iva.md` (IVA-001…036).

## Restricciones no negociables

Heredadas de `AGENTS.md`, ADR 0005, 0021, 0022 y del plan de integración IVA. Todo paquete de tareas debe repetirlas.

1. **Freeze Web**: no mover `app`, `src` ni `public`. Mover rutas *dentro* de `app/(app)` está permitido; las rutas antiguas quedan como redirecciones.
2. **Lógica tributaria solo en `packages/business/*`** (`taxation`, `fiscal`, `tax-reporting`, `purchasing`, `sales`). `src/modules/iva/frontend/**` contiene únicamente presentación, hooks de consumo HTTP y formateo de UI.
3. **API y base de datos aditivas y compatibles**. Ninguna RPC existente cambia de firma; se agregan RPC o parámetros opcionales. Migraciones nuevas con la convención vigente `YYYYMMDDHHMMSS_<nombre>.sql` en `supabase/migrations`.
4. **Un solo proyecto Supabase (producción)**. Ninguna migración se aplica sin confirmación explícita del usuario. Antes y después de aplicar: verificación MCP de objetos, grants (`anon`/`authenticated` sin `EXECUTE`, RLS activo sin políticas) y advisors de seguridad.
5. **No promover automáticamente documentos heredados a hechos fiscales.** La incorporación en lote (fase F4) es una acción explícita de un usuario autorizado, con vista previa, exclusiones y evidencia; nunca un job ni un trigger sobre datos existentes.
6. **No etiquetar nada como “Forma IVA 30” oficial** mientras no exista especificación SENIAT vigente verificada (IVA-032–034 siguen abiertos según el plan de integración). La vista de la fase F6 se llama «Resumen de autoliquidación» y lleva la advertencia de borrador interno.
7. **No inferir tasas, deducibilidad, exoneraciones ni periodicidad.** Valores desconocidos producen un pendiente visible, no un valor por defecto.
8. TypeScript estricto, imports sin extensión, errores esperados tipados, TSDoc API-grade en todo símbolo público, sin módulos `utils`/`helpers`/`shared` genéricos.

## Diagnóstico

### Interfaz actual

- `src/shared/frontend/components/sidebar-subnav.tsx:98` (`NAV_ITEM_ICONS`) no registra ninguna ruta IVA: las siete entradas caen en `CircleDot`.
- `src/shared/frontend/navigation.ts:95` alterna grupos (`Libros`, `Operaciones`, `Libros`, `Operaciones`) y produce separadores sueltos.
- `app/(app)/fiscal/page.tsx`: tablero de cinco tarjetas de enlaces, sin datos, en `font-mono`.
- `app/(app)/purchases/iva-matches/page.tsx`: captura asignaciones y evidencia como **JSON crudo**, IDs pegados a mano e importes en unidades menores.
- `app/(app)/settings/iva/page.tsx`: 12 campos planos; versión histórica por número; perfil de contraparte por ID; muestra valores internos (`taxed`, `base`); contiene series de facturación de venta, que no pertenecen a IVA.
- `app/(app)/purchases/iva-imports/page.tsx`: formulario único de ~25 campos sin lógica condicional ni totales.
- `app/(app)/fiscal/iva-ledger-view.tsx`: KPIs de paginación («Documentos en esta página»), sin columnas de libro (RIF, factura, control, tipo, afectada, retención), sin exportación, valores de dominio sin traducir, modal de revisión que pide «Decimales de moneda».
- `app/(app)/fiscal/iva-declarations/page.tsx`: formularios de ciclo de vida dentro de celdas; arrastre tecleado a mano; formato monetario distinto al de los libros.
- Duplicación: 4 copias de `Field`/`inputClass`, 2 formateadores monetarios; no se usan `BaseInput`, `BaseSelect`, `BaseTable`, `BaseBadge`, `StatTile`, `ResponsiveDrawer`.

### Comprobación Supabase (MCP, solo lectura, 2026-10-22)

| Objeto | Filas | Implicación |
| --- | --- | --- |
| `shared_tax_reporting_facts` | 0 | Libros “Hechos guardados” vacíos para todas las empresas. |
| `shared_tax_reporting_declarations` | 0 | Ninguna declaración puede prepararse hoy. |
| `shared_company_tax_rules` / catálogos | 0 / 3 vacíos | Las empresas no tienen reglas propias. |
| `shared_tax_rules` (global) | 2 (16 % gravado, 0 % exento) | Sin reducida ni adicional; A1–A5 sin mapeo. |
| `shared_tax_counterparty_profiles`, `shared_supplier_invoice_matches`, `shared_fiscal_documents`, `shared_company_document_series` | 0 | Flujos nuevos sin uso. |
| `shared_inventory_purchase_invoices` confirmadas | 1.879 en 11 empresas (1.871 facturas, 4 NC) | Los datos reales viven en las fuentes heredadas. |
| `shared_inventory_sales_invoices` confirmadas | 29 (21 `nota_entrega`, 8 `venta`), todas sin número de control | No hay facturas de venta fiscales. |

Hallazgos de calidad:

- `read_iva_legacy_sources` filtra por `invoice_date`, pero **399 compras confirmadas (21 %)** tienen `period` distinto del mes de la fecha (período manual). El libro IVA y el Libro de Compras de inventario mostrarían meses distintos.
- 0 compras con `vat_retention_amount`, porcentaje o comprobante. Existe `shared_inventory_iva_retention_period` y `GET /api/purchases/iva-retention-export`; hay que determinar dónde viven realmente las retenciones antes de mostrarlas.
- 1 compra con fecha `0003-05-23`, 1 con fecha futura, 70 facturas sin número de control.
- Seguridad correcta: las 10 tablas IVA tienen RLS sin políticas y sin grants a `anon`/`authenticated`; todas las RPC IVA son `SECURITY DEFINER` sin `EXECUTE` público.
- Índice disponible para agregados: `shared_tax_reporting_facts_scope_page_idx (tenant_id, organization_id, company_id, recognition_date, id)`.
- La empresa de la captura de referencia (J-30396882-1, contribuyente especial) no tiene documentos: las pruebas manuales deben usar una de las 11 empresas con compras.

## Modelo de dominio objetivo

IVA es un **contexto de reporte** aguas abajo de Compras y Ventas. No captura operaciones comerciales: las clasifica, las agrega por período y produce libros y autoliquidaciones.

### Período fiscal (nuevo agregado en `@kontave/tax-reporting`)

```
Abierto ──► En revisión ──► Preparado ──► Declarado ──► Pagado ──► Cerrado
   ▲             │               │
   └─────────────┴── reabrir (con motivo, solo antes de Declarado)
```

- Identidad: `(tenantId, organizationId, companyId, periodicity, periodKey)`. `periodKey` = `YYYY-MM` o `YYYY-MM-Q1|Q2`.
- **Periodicidad** proviene del perfil fiscal de la empresa (`shared_company_fiscal_profile_*`) y nunca se asume. Si el perfil no la define, el período queda en estado `Abierto` con pendiente «Periodicidad no configurada» y no puede prepararse.
- Estado derivado: los conteos (documentos incorporados, pendientes, total débito/crédito) se calculan desde hechos; el estado persistido solo registra transiciones con actor, fecha, motivo e idempotencia.
- `Preparado` referencia la revisión de declaración vigente (`shared_tax_reporting_declarations`); `Declarado`/`Pagado` reutilizan el ciclo existente (`change-vat-declaration-lifecycle`).
- `Cerrado` impide registrar hechos con `period` igual al cerrado; las correcciones se registran como ajuste en el siguiente período abierto (comportamiento coherente con `shared_tax_reporting_validate_correction_fact`).
- **Excedente arrastrado** (`carryForwardIn`) se obtiene de la declaración pagada/declarada del período anterior. El ingreso manual solo se permite cuando no existe período anterior en Kontave, con motivo obligatorio.

La introducción del agregado requiere un ADR nuevo (`docs/adr/0045-vat-fiscal-period.md`) antes de la migración.

### Lenguaje ubicuo de la interfaz

| Término interno | Término en pantalla |
| --- | --- |
| hecho / fact | documento incluido en el libro |
| fuente heredada / legacy source | documento sin incorporar |
| reconciliation `issue` | pendiente |
| reconciliation `reconciled` | incluido |
| deductible `eligible` / `ineligible` / `pending_review` | crédito fiscal: admitido / no admitido / por revisar |
| treatment `taxed` / `zero_rated` / `exempt` / `exonerated` / `not_subject` | gravado / tasa cero / exento / exonerado / no sujeto |
| component `base` / `luxury` / `payment` | alícuota / adicional suntuario / adicional por pago en divisas |
| `practiced` / `suffered` | retención practicada / soportada |
| minor units, snapshot, lineage | no se muestran |

Las traducciones viven en `src/modules/iva/frontend/labels.ts` (un único diccionario tipado por union literal; `never` exhaustivo).

## Arquitectura de información

7 pantallas navegables + 2 vistas de detalle.

| Grupo | Ruta nueva | Pantalla | Permiso de lectura | Casos IVA | Ruta antigua (redirección 308) |
| --- | --- | --- | --- | --- | --- |
| — | `/fiscal` | Tablero del período | `purchases.read` **o** `sales.read` | 022, 031 | — |
| Período | `/fiscal/compras` | Libro de compras | `purchases.read` | 019, 023, 025, 027–030 | `/purchases/iva-ledger` |
| Período | `/fiscal/ventas` | Libro de ventas | `sales.read` | 020, 024, 026–030 | `/sales/iva-ledger` |
| Período | `/fiscal/pendientes` | Pendientes | `purchases.read` o `sales.read` | 012, 019, 025 | `/purchases/iva-matches` |
| Período | `/fiscal/importaciones` | Importaciones | `purchases.read` (+`purchases.confirm` para crear) | 018, 021 | `/purchases/iva-imports` |
| Declaración | `/fiscal/declaraciones` | Declaraciones | igual que hoy (`/fiscal/iva-declarations`) | 033, 036 | `/fiscal/iva-declarations` |
| Declaración | `/fiscal/declaraciones/[periodo]` | Detalle y resumen de autoliquidación | ídem | 031–035 | — |
| Configuración | `/fiscal/configuracion` | Pestañas: Alícuotas · Contrapartes · Empresa | `companies.read` (+`companies.update` para editar) | 001–010, 015–018 | `/settings/iva` |
| — | panel lateral | Detalle de documento | según libro | 013, 014 | modal de revisión |

Fuera de IVA:

- «Series para facturas de venta» se mueve a `/settings/company` (sección propia) sin cambiar `/api/companies/document-series`.
- IVA-008 (alícuota por artículo) se edita en la ficha de producto de Inventario. Configuración › Alícuotas solo muestra cuántos artículos usan cada regla (`shared_product_tax_assignments`) con enlace filtrado.
- `MODULE_SUBNAV.purchases` y `.sales` conservan «Libro IVA» apuntando a las rutas nuevas.

### Sidebar

```ts
iva: [
  { href: "/fiscal",                label: "Tablero",          group: null },
  { href: "/fiscal/compras",        label: "Libro de compras", group: "Período" },
  { href: "/fiscal/ventas",         label: "Libro de ventas",  group: "Período" },
  { href: "/fiscal/pendientes",     label: "Pendientes",       group: "Período" },
  { href: "/fiscal/importaciones",  label: "Importaciones",    group: "Período" },
  { href: "/fiscal/declaraciones",  label: "Declaraciones",    group: "Declaración" },
  { href: "/fiscal/configuracion",  label: "Configuración",    group: "Configuración" },
]
```

Iconos (`lucide-react`) en `NAV_ITEM_ICONS`: `LayoutDashboard`, `BookDown`, `BookUp`, `ListTodo`, `Ship`, `FileCheck2`, `Settings2`. Verificar que existan en la versión instalada; si falta alguno, usar `BookOpen`/`ClipboardList`/`FileText` sin repetir icono dentro del módulo. «Pendientes» muestra un contador (opcional en F3).

### Contexto en la URL

Período, quincena, búsqueda, pestaña y cursor viven en `searchParams` (`/fiscal/compras?periodo=2026-10&q=J-1234`). El tablero y los pendientes enlazan a los libros prefiltrados.

## Wireframes de referencia

### Tablero

```
┌ IVA · Octubre 2026 ▾ ─────────────── Estado: EN REVISIÓN ─── Vence: <calendario> ┐
│ Débito fiscal     Crédito fiscal    Retenciones      Cuota estimada / excedente  │
│ Bs 48.210,00      Bs 31.540,00      Bs 6.200,00      Bs 10.470,00                │
├──────────────────────────────────────┬───────────────────────────────────────────┤
│ 12 pendientes antes de declarar       │ Progreso del período                      │
│  · 41 documentos sin incorporar       │  ● Documentos incorporados   96 %         │
│  · 7 sin número de control            │  ○ Pendientes resueltos                   │
│  · 3 notas sin factura afectada       │  ○ Autoliquidación preparada              │
│  [Resolver pendientes →]              │  ○ Declarada   ○ Pagada                   │
├──────────────────────────────────────┴───────────────────────────────────────────┤
│ Por alícuota        Base compras   Crédito    Base ventas    Débito              │
└──────────────────────────────────────────────────────────────────────────────────┘
```

«Vence» solo se muestra si existe una fuente de calendario verificable (Herramientas › Calendario SENIAT); si no, se omite.

### Libro (compras y ventas comparten componente)

```
┌ Libro de compras · Oct 2026 ▾  [Quincena: Todo ▾]  🔍 RIF/nombre/factura   [PDF] [Excel] ┐
│ 184 documentos · Base Bs … · Crédito Bs … · Retenido Bs … · 7 pendientes               │
├──┬───────┬─────────────────┬───────┬────────┬─────┬────────┬───────┬───────┬──────┬─────┤
│N°│Fecha  │RIF / Razón soc. │Fact.  │Control │Tipo │Afectada│Exento │Base   │IVA   │Ret. │
├──┴───────┴─────────────────┴───────┴────────┴─────┴────────┴───────┴───────┴──────┴─────┤
│ Totales por alícuota                                                                  │
└───────────────────────────────────────────────────────────────────────────────────────┘
clic en fila → panel lateral «Detalle de documento»
```

### Pendientes

```
┌ Pendientes · Oct 2026 ───────────────────────────────────────────────────────┐
│ [Sin incorporar 41] [Sin n° control 7] [Nota sin afectada 3] [Alícuota 2] … │
├──────────────────────────────────────────────────────────────────────────────┤
│ ☐ 03/10  J-1234 Droguería X   Fact. 000451   Bs 1.200,00   [Ver detalle]    │
│ [Revisar e incorporar seleccionados]   [Excluir con motivo]                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Detalle de declaración

```
┌ Declaración IVA · Octubre 2026 · Revisión 2 ──────────── ● Preparada ┐
│ ① Preparada 14/11 → ② Declarada → ③ Pagada                           │
│ Resumen de autoliquidación (borrador interno, no es Forma IVA 30)    │
│  Débitos · Créditos · Excedente anterior (automático) · Retenciones  │
│  Total a pagar / excedente para el próximo período                   │
│ [Registrar declaración] [Registrar pago] [Anular]  → panel lateral   │
└──────────────────────────────────────────────────────────────────────┘
```

## Estructura de código

```
app/(app)/fiscal/
  layout.tsx                          # IvaPeriodProvider (empresa + período desde searchParams)
  page.tsx                            # Tablero
  compras/page.tsx
  ventas/page.tsx
  pendientes/page.tsx
  importaciones/page.tsx              # lista + botón «Nueva importación»
  importaciones/nueva/page.tsx        # asistente por pasos
  declaraciones/page.tsx
  declaraciones/[periodo]/page.tsx
  configuracion/page.tsx
  iva-declarations/page.tsx           # redirect → /fiscal/declaraciones
app/(app)/purchases/iva-ledger|iva-imports|iva-matches/page.tsx   # redirects
app/(app)/sales/iva-ledger/page.tsx                                 # redirect
app/(app)/settings/iva/page.tsx                                     # redirect

src/modules/iva/frontend/
  iva-client.ts                       # fetch tipado a /api/fiscal/iva/** (un único lugar para errores y parseo)
  labels.ts                           # lenguaje ubicuo (tabla anterior)
  money-format.ts                     # formato es-VE de SerializedMoney (reemplaza formatMoney/moneyLabel)
  context/iva-period-context.tsx
  hooks/use-period-summary.ts
  hooks/use-vat-ledger.ts
  hooks/use-pending-items.ts
  hooks/use-declarations.ts
  hooks/use-tax-configuration.ts
  components/period-selector.tsx
  components/period-status-badge.tsx
  components/ledger-table.tsx
  components/document-drawer.tsx
  components/pending-list.tsx
  components/import-wizard/*.tsx
  components/declaration-timeline.tsx
  components/self-assessment-summary.tsx
  components/counterparty-picker.tsx  # busca proveedores/clientes existentes por RIF o nombre
```

`money-format.ts` y `labels.ts` son presentación de la capacidad IVA, no utilidades genéricas; si `@kontave/monetary` ya expone un formateador es-VE, usarlo en su lugar.

## Fases

Orden: F0 → F1 → (F2 ∥ F5-ADR) → F3 → F4 → F5 → F6 → F7 → F8. F0 y F1 no dependen de backend y pueden entregarse a producción por separado.

Cada fase termina con: `pnpm lint`, `pnpm build`, `check`/`test` de los paquetes tocados y, si hay SQL, el script `test:iva:*:sql` correspondiente.

### F0 · Navegación e iconos — `web_engineer`

- **Rutas permitidas**: `src/shared/frontend/navigation.ts`, `src/shared/frontend/components/sidebar-subnav.tsx`, `packages/experience/navigation/src/index.ts` (solo IDs de destino si hace falta).
- **Trabajo**: reordenar `MODULE_SUBNAV.iva` con los grupos de este plan usando aún las rutas actuales; registrar los siete iconos; mantener `navigationDestinationFor` coherente.
- **Aceptación**: ningún ítem IVA usa `CircleDot`; un separador por grupo; los demás módulos no cambian; los permisos del sidebar siguen filtrando igual.

### F1 · Fundaciones de UI IVA — `web_engineer`

- **Rutas permitidas**: `src/modules/iva/frontend/**` (nuevo), páginas IVA existentes solo para sustituir duplicados.
- **Trabajo**: `iva-client.ts`, `labels.ts`, `money-format.ts`, `period-selector`, `period-status-badge`, `ledger-table` (base sobre `BaseTable`), `document-drawer` (base sobre `ResponsiveDrawer`). Quitar `font-mono` del módulo; reemplazar `Field`/`inputClass` locales por `BaseInput`/`BaseSelect`; usar `BaseButton` en todos los botones.
- **Aceptación**: cero copias locales de `Field`, `inputClass`, `formatMoney`, `moneyLabel` en páginas IVA; ningún valor de dominio crudo visible (revisar con búsqueda de `taxable|taxed|pending_review|practiced` en JSX); montos con formato `Bs 1.234,56` uniforme; sin cambios de comportamiento ni de llamadas HTTP.

### F2 · Contratos de lectura — `backend_engineer`

Paquete propietario: `@kontave/tax-reporting`. Rutas: `packages/business/tax-reporting/**`, `app/api/fiscal/iva/**`, `supabase/migrations/<nuevo>`, `scripts/test-iva-reporting-sql.mjs`, `src/modules/organizations/backend/web-api-route-access.ts`.

1. **Resumen de período** — caso de uso `GetVatPeriodSummary` y RPC `shared_tax_reporting_period_summary(p_tenant_id, p_organization_id, p_company_id, p_actor_id, p_period)`.
   Devuelve: débito, crédito admitido, crédito por revisar, retenciones practicadas/soportadas, totales por `(component, category, rate)` para compras y ventas, conteo de hechos por estado de conciliación y conteo de documentos heredados sin incorporar del período. Montos como `SerializedMoney` por moneda (sin conversión implícita).
   Endpoint: `GET /api/fiscal/iva/period-summary?companyId&period` con `purchases.read` o `sales.read` (las secciones sin permiso se omiten, no se devuelven en cero).
2. **Libro con columnas de libro** — ampliar la proyección de `build-vat-ledger` (aditivo) con: número de operación correlativo, RIF, razón social, número de factura, número de control, tipo de documento, factura afectada, exento, base e impuesto por alícuota, retención y comprobante. Si el dato no existe en el hecho, `null` explícito.
   Agregar parámetro opcional `period` a los endpoints de libro: cuando se envía, filtra por `period` del hecho; `from`/`to` siguen funcionando (IVA-022).
   Totales del período **completo** (no por página) devueltos desde la RPC de resumen; la UI deja de sumar páginas.
3. **Fuentes heredadas por período** — nueva RPC (no modificar `read_iva_legacy_sources`) que acepta `p_period` y filtra por `coalesce(period, to_char(invoice_date,'YYYY-MM'))`, devolviendo además los motivos de pendiente calculados: sin número de control, fecha inválida o futura, nota sin factura afectada, tipo no soportado (`nota_entrega`), alícuota de línea no reconocida, retención sin comprobante.
   **Decisión requerida del usuario/contador antes de implementar**: confirmar que el período fiscal de un documento heredado es su `period` (incluido el manual) y no el mes de `invoice_date`. El plan asume `period`.
4. **Exportación** — `GET /api/fiscal/iva/{purchase|sales}-ledger/export?format=csv|xlsx&period` desde el mismo caso de uso del libro; PDF se genera en el cliente con jsPDF como los demás reportes.
5. **Retenciones** — investigar `shared_inventory_iva_retention_period` y `GET /api/purchases/iva-retention-export` y documentar en este plan la fuente real de retenciones antes de exponerlas en el libro.

- **Aceptación**: pruebas de paquete para resumen (signos de NC/ND, multimoneda, período vacío, permisos parciales) y para la nueva proyección; prueba SQL de aislamiento tenant/empresa y de grants; los consumidores actuales de las RPC y endpoints existentes no cambian; verificación MCP posterior a la migración.

### F3 · Tablero, libros y pendientes — `web_engineer`

Depende de F1 y F2. Rutas: `app/(app)/fiscal/**`, redirecciones de rutas antiguas, `src/modules/iva/frontend/**`, `src/modules/organizations/frontend/module-access-policy.ts`, `src/shared/frontend/navigation.ts`.

- Tablero según wireframe, alimentado por `period-summary`. Estado del período derivado en cliente hasta F5 (`Sin documentos`, `Con pendientes`, `Listo para preparar`, `Preparado`, `Declarado`, `Pagado`) a partir del resumen y del historial de declaraciones.
- Libro de compras y de ventas con columnas de libro, búsqueda, quincena (filtro de cliente sobre fecha cuando la periodicidad sea quincenal), totales del período, exportación CSV/XLSX/PDF y panel de detalle.
- Pendientes: pestañas por motivo; en esta fase solo lectura y enlace al panel de detalle, que conserva la revisión individual existente (con formulario rediseñado: moneda y decimales derivados del documento, categorías traducidas).
- Registrar las nuevas rutas en `module-access-policy.ts` y redirigir las antiguas.
- **Aceptación**: probado con una empresa que tenga compras (no J-30396882-1); números del tablero = totales del libro del mismo período; enlaces antiguos redirigen conservando `searchParams`; vista móvil sin scroll horizontal de página (la tabla sí puede desplazarse dentro de su contenedor).

### F4 · Incorporación revisada en lote — `backend_engineer`, luego `web_engineer`

Restricción 5 aplica de forma estricta.

- **Backend**: caso de uso `ReviewLegacyVatSourcesBatch` en `@kontave/tax-reporting` que recibe una lista acotada (≤ 100) de documentos heredados **seleccionados por el usuario**, sus clasificaciones confirmadas y una clave idempotente por lote. Reutiliza `record-reviewed-legacy-vat-source` por documento, en una transacción por lote, y devuelve resultado por documento (`incorporado`, `rechazado` + motivo tipado). Documentos con pendientes bloqueantes se rechazan, no se corrigen.
  Propuesta de clasificación: el servidor sugiere categoría/tasa solo cuando la línea heredada trae `vat_rate` que coincide exactamente con una regla vigente del catálogo de la empresa en la fecha; la sugerencia se presenta como «coincide con regla X» y requiere confirmación. Sin regla de empresa, no hay sugerencia (hoy los catálogos están vacíos, por lo que F7-Configuración es prerrequisito operativo).
- **Web**: en Pendientes › «Sin incorporar», selección múltiple → pantalla de vista previa (totales antes/después, documentos excluidos y por qué) → confirmar → resultado por documento.
- **Aceptación**: reintento del mismo lote no duplica hechos (linaje único ya existente); rechazo parcial no deja hechos huérfanos; permiso `purchases.confirm` / `sales.update`; prueba con 100 documentos; nada se incorpora sin acción del usuario.

### F5 · Período fiscal — `backend_engineer`

Requiere ADR 0045 aprobado por el usuario.

- Dominio: agregado `VatFiscalPeriod`, transiciones y errores tipados en `@kontave/tax-reporting/domain`; puerto `VatFiscalPeriodRepository`.
- Persistencia: tablas `shared_tax_reporting_periods` y `shared_tax_reporting_period_events` (+ comandos idempotentes), RLS sin políticas, sin grants públicos; RPC de lectura y de transición.
- Periodicidad desde el perfil fiscal de la empresa; si falta, pendiente bloqueante.
- Cierre: `shared_tax_reporting_fact_append` rechaza hechos de períodos cerrados con error tipado `TAX_REPORTING_PERIOD_CLOSED` (cambio aditivo: hoy no hay períodos, por lo que ningún flujo existente se ve afectado).
- Endpoint: `GET /api/fiscal/iva/periods?companyId&from&to`, `POST /api/fiscal/iva/periods/{periodKey}/transition`.
- **Aceptación**: pruebas de transición válidas/inválidas, concurrencia (CAS por versión), aislamiento y cierre; el tablero pasa a leer el estado persistido.

### F6 · Declaraciones — `backend_engineer` + `web_engineer`

- Backend: `prepare-vat-declaration` obtiene `carryForwardIn` de la declaración del período anterior; entrada manual solo sin antecedente y con motivo (campo nuevo opcional, compatible).
- Web: `/fiscal/declaraciones` (todas las revisiones de todos los períodos, filtro por año y estado — IVA-036) y `/fiscal/declaraciones/[periodo]` con línea de tiempo, resumen de autoliquidación (impresión PDF con la advertencia de borrador interno) y acciones de presentación/pago/anulación en panel lateral.
- **Aceptación**: arrastre reproducible desde el período anterior; ninguna etiqueta «Forma IVA 30»; acciones solo en la revisión vigente.

### F7 · Formularios — `web_engineer` (+ `backend_engineer` para búsquedas)

1. **Importaciones**: lista de importaciones del período (hechos con `direction = import`) + asistente `/fiscal/importaciones/nueva` en 5 pasos: Tipo y documento → Importes (con total calculado para cotejo visual, no para determinar IVA) → Crédito fiscal → Beneficio (solo si la categoría es exonerada) → Revisión y confirmación. Validación por paso; «Nota de revisión» obligatoria solo si no se marca conciliado.
2. **Conciliación de compras** (antes `iva-matches`): dentro del panel de detalle de una factura recibida. Selección de proveedor y documento por búsqueda; tabla de líneas fiscales con selector de línea de recepción/orden y cantidades; montos en bolívares con decimales. La UI construye el JSON actual del endpoint; el contrato `POST /api/fiscal/iva/purchase-matches` no cambia. Requiere endpoints de lectura de documentos recibidos y líneas de recepción elegibles (backend, aditivos).
3. **Configuración** (`/fiscal/configuracion`):
   - *Alícuotas*: tabla agrupada por componente/categoría con badges de vigencia; alta/edición en panel lateral con secciones (Clasificación · Tasa y modo de precio · Vigencia · Fundamento); historial de versiones como selector de lista, no número tecleado; diff contra la versión actual antes de guardar.
   - *Contrapartes*: `counterparty-picker` sobre proveedores y clientes existentes; lista de perfiles vigentes; edición en panel lateral.
   - *Empresa*: perfil fiscal de la empresa (contribuyente especial, agente de retención, periodicidad) en solo lectura con enlace a donde se edita, o edición si ya existe contrato.
4. Mover «Series de facturación» a `/settings/company`.

- **Aceptación**: ningún campo pide IDs, JSON, unidades menores ni decimales de moneda; todos los formularios usan componentes `Base*`; errores del servidor mostrados junto al campo o en el encabezado del panel en español.

### F8 · Documentación — `documentation_engineer`

Actualizar `PLAN_INTEGRACION_IVA.md` (matriz IVA-001–036 con consumidor Web real), ADR 0045, README de `@kontave/tax-reporting` (nuevos casos de uso y RPC) y el resumen de rutas de `AGENTS.md` si cambia la sección de módulos.

## Matriz de casos de uso → pantalla

| Casos | Pantalla | Fase |
| --- | --- | --- |
| 001–007, 009, 010 | Configuración › Alícuotas | F7 |
| 008 | Ficha de producto (Inventario) + conteo en Alícuotas | F7 |
| 011, 012, 013, 014 | Emisión/confirmación en Ventas y Compras (plan de integración); detalle de documento en IVA | F3 |
| 015–018 | Configuración › Contrapartes; Importaciones | F7 |
| 019, 020 | Libros + Tablero | F3 |
| 021 | Importaciones | F7 |
| 022 | Libros (período o rango) + Tablero | F2–F3 |
| 023–030 | Libros, Pendientes, exportación | F2–F4 |
| 031 | Tablero + preparación | F3, F6 |
| 032–034 | Resumen de autoliquidación (borrador); forma oficial bloqueada por especificación | F6 |
| 035 | Registrar pago | F6 |
| 036 | Declaraciones (todas) | F6 |

## Decisiones del plan

| Decisión | Estado | Resolución |
| --- | --- | --- |
| Período de un documento heredado: `period` (manual) vs mes de `invoice_date` | Resuelta por usuario | Usar `period` guardado y conservarlo en hechos revisados. |
| Fuente real de las retenciones IVA | Investigada | Export heredado no certifica retención completa; los libros usan retenciones evidenciadas en hechos. |
| Tratamiento de `nota_entrega` y `venta` sin número de control en el libro de ventas | Resuelta | Mostrar como fuente pendiente; excluir del libro sin incorporación automática. |
| Periodicidad y regla de vencimiento para contribuyentes especiales | Parcial | No inferir; periodicidad explícita y período bloqueado si falta configuración. Calendario de vencimientos queda fuera. |
| Aprobación del ADR del período fiscal | Resuelta por usuario | ADR 0045 redactado y aprobado para avanzar. |
| Especificación vigente Forma IVA 30 | Bloqueada por fuente oficial pendiente | No se etiqueta ni emite como oficial. |

## Paquete de tarea tipo para Codex

```
Rol: <backend_engineer | web_engineer>
Fase: F<n> — <título>
Resultado: <qué debe existir al terminar>
Rutas permitidas: <lista exacta>
Exclusiones: app, src y public no se mueven; sin cambios de firma en RPC/endpoints existentes; sin migraciones aplicadas sin confirmación; sin promoción automática de heredados; sin etiqueta «Forma IVA 30».
Contrato: <tipos/endpoint/RPC de esta fase>
Aceptación: <criterios de la fase>
Validación: pnpm lint · pnpm build · corepack pnpm --filter @kontave/tax-reporting check · corepack pnpm --filter @kontave/tax-reporting test · pnpm test:iva:reporting:sql (si hay SQL) · verificación MCP (si hay migración)
Entrega: resumen, archivos tocados, evidencia de validación; no logs crudos.
```

## Ejecución de este plan (2026-10-23)

Estado: implementación local de las rutas, contratos, formularios, resumen, libro, declaración y lote de revisión. Las migraciones nuevas se aplicaron al entorno dev de Supabase el 2026-10-23 (ver «Aplicación en dev»).

Decisiones resueltas:

- Las fuentes heredadas se consultan por su campo guardado `period`, aunque difiera del mes de `invoice_date`. Al revisar una fuente dentro del período manual, la API conserva ese período seleccionado.
- ADR 0045 fue redactado y aceptado para el agregado de período fiscal. La periodicidad sigue siendo explícita y puede estar sin configurar.
- No se encontró una fuente suficiente para certificar retenciones completas: el export heredado no se presenta como libro IVA autoritativo. Las retenciones mostradas en resumen/libros proceden únicamente de hechos fiscales guardados.
- `nota_entrega` y ventas sin número de control se exponen como fuentes pendientes; no se incorporan automáticamente al libro.

Implementado localmente:

- Navegación fiscal agrupada, alias/redirecciones de rutas previas, selector por período y protección de accesos de las nuevas rutas.
- Resumen de período con totales serializados por moneda, conciliación, pendientes de incorporación y permisos de lectura.
- Filtro opcional por período para leer fuentes heredadas y etiquetas de causas pendientes.
- Agregado de período fiscal con transiciones auditadas, control de concurrencia/idempotencia y bloqueo de nuevos hechos en períodos cerrados.
- Asistente de importación en cinco pasos; selección de categoría exonerada controla la evidencia de beneficio, y nota de revisión se exige si no se concilia.
- Selección múltiple, vista previa y persistencia transaccional idempotente de hechos heredados que pasen la revisión; bloqueos se reportan por documento.
- Exportaciones CSV/XLSX/PDF del período completo, detalle lateral de hechos, filtros del libro, contrapartes existentes en configuración y series de venta en ajustes de empresa.
- Historial de declaraciones por año/estado, detalle con acciones de ciclo y PDF interno; arrastre sale del resultado negativo de declaración anterior presentada/pagada o exige motivo manual si no hay declaración previa.
- Migraciones para resumen, lectura por período, lote y ciclo del agregado, aplicadas en dev.
- ADR 0045 y pruebas de dominio del agregado.

Cierre de pendientes (2026-10-23):

- **Periodicidad IVA**: comando auditado `shared_tax_reporting_periodicity_set` (permiso `companies.update`, compare-and-swap, idempotencia, motivo obligatorio al cambiar un valor existente y bloqueo `TAX_REPORTING_PERIODICITY_LOCKED` cuando ya hay períodos registrados) y lectura `shared_tax_reporting_periodicity_read`; casos de uso `GetVatPeriodicity`/`ConfigureVatPeriodicity` en `@kontave/tax-reporting`, ruta `/api/fiscal/iva/periodicity` y formulario con historial en Configuración › Empresa. Sigue empezando en `NULL`; nunca se infiere.
- **Alícuotas por producto (IVA-008)**: lectura `shared_product_tax_assignment_summary` y caso de uso `SummarizeProductTaxAssignments` en `@kontave/taxation`, ruta `/api/fiscal/iva/product-tax-assignments` y tabla en Configuración › Alícuotas con productos sin asignación vigente y discrepancias contra el tipo IVA del catálogo. Los enlaces abren `/inventory/products?iva=general|exento`, que ahora acepta ese filtro.
- **Controles `Base*` y responsive**: configuración, declaraciones, detalle de declaración, asistente de importación, libro, revisión de fuentes heredadas, acciones de ciclo, selector de período y series de factura usan `BaseInput`/`BaseSelect`/`BaseButton`/`BaseCheckbox`; no queda `font-mono` en el módulo. El detalle de documento y la revisión de fuentes usan `ResponsiveDrawer` (hoja inferior en móvil); tablas con desplazamiento horizontal; el asistente muestra «Paso n de 5» en móvil. Versión histórica del catálogo y año del historial se eligen de una lista.
- **Revisión de fuente heredada sin IDs ni decimales tecleados**: la moneda y sus decimales salen del documento (ISO 4217); la nota de crédito/débito se vincula a su factura mediante `affectedSourceId` y el servidor deriva el hecho afectado (`reviewedAffectedFactId`). `affectedFactId` explícito sigue aceptado por compatibilidad.
- **Texto dañado**: se reparó doble codificación UTF-8 («PerÃ­odo») en el libro y en los mensajes de las rutas de libro.
- **Número fiscal, control y correlativo**: limitación aceptada. Se muestran solo cuando el snapshot los guarda; los hechos antiguos muestran su identificador de origen y no se inventan valores.

Fuera de este plan, con evidencia:

- **Conciliador visual proveedor-factura**: no puede construirse en la Web porque no existen las fuentes que debería seleccionar. Compras no tiene tablas, adaptadores ni lecturas de órdenes ni recepciones (solo `find` por id en los puertos de dominio), y ningún flujo registra facturas fiscales recibidas (`shared_fiscal_documents` en `received`: 0 filas en dev; `shared_supplier_invoice_matches`: 0). El endpoint `POST /api/fiscal/iva/purchase-matches` y su confirmación atómica quedan disponibles. Pasa al plan de Compras: persistencia y lectura de órdenes/recepciones y registro de facturas recibidas; después, el conciliador.

Validación (2026-10-23): `pnpm lint` (0 errores; 328 avisos preexistentes, ninguno en los archivos tocados), `pnpm build`, `tsc --noEmit` global, `@kontave/tax-reporting` 69/69, `@kontave/taxation` 62/62, `@kontave/purchasing` 35/35, `@kontave/payables` 14/14, auditor de rutas (215 handlers) y harness `test:iva:reporting:sql`, `test:iva:configuration:sql`, `test:iva:taxation:sql`, `test:iva:supplier-match:sql`. Sin navegador disponible, la comprobación responsive fue de código; falta una revisión visual en móvil.

### Aplicación en dev (2026-10-23)

Migraciones aplicadas con el MCP de Supabase, renombradas localmente a la versión registrada: `20261023154003_iva_period_summary`, `20261023154035_iva_legacy_period_sources`, `20261023154113_vat_fiscal_periods`, `20261023154126_iva_legacy_batch`, `20261023154141_iva_fact_period_list`, `20261023154345_vat_fiscal_period_company_fk_index` (índice de la FK señalado por el advisor de rendimiento) y `20261023160325_iva_company_configuration` (periodicidad y conteo de alícuotas por producto; prueba de humo con usuario real en transacción revertida: lectura, conteo 910 gravados / 424 exentos / 0 sin asignación, configuración, replay idempotente y rechazo de actor ajeno).

Verificación:

- Funciones `SECURITY DEFINER` ejecutables solo por `service_role`; tablas nuevas con RLS activo, sin políticas y sin privilegios para `anon`/`authenticated`; trigger de período cerrado activo sobre `shared_tax_reporting_facts`.
- Advisors: sin advertencias nuevas de seguridad (solo el INFO esperado de RLS sin políticas en las 4 tablas nuevas); la FK sin índice quedó cubierta.
- Prueba de humo sobre datos reales dentro de una transacción revertida: el conteo heredado del resumen coincide con el conteo directo (162 compras en 2026-04), la paginación de fuentes recorre los 162 documentos, la transición falla sin periodicidad, con periodicidad avanza a `in_review`, reproduce idempotencia y rechaza versión obsoleta y transición inválida; actor ajeno y organización ajena reciben error de alcance. Las cuatro lecturas `STABLE` funcionan en transacción de solo lectura. No quedaron filas escritas.
- `test:iva:reporting:sql` incluye ahora la migración de índice. El resumen y la lectura de fuentes por período no tienen cobertura en el harness PGlite; su validación es la prueba de humo anterior.

Producción sigue pendiente de una aplicación explícita. La implementación no es una certificación fiscal y no habilita la Forma IVA 30 oficial.
