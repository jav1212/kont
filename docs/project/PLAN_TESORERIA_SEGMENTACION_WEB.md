# Plan de segmentación Web de Tesorería

Fecha: 2026-10-22. Estado: implementación Web completa salvo smoke visual y por rol; ver seguimiento al final. Alcance: presentación Web (`app/(app)/treasury/**`, navegación y adaptador cliente). La ejecución no cambia contratos, endpoints, RPC ni migraciones.

Ejecuta la sección «Diseño del módulo Web» de [PLAN_TESORERIA_WEB_PRODUCCION](PLAN_TESORERIA_WEB_PRODUCCION.md), que ya proponía rutas por capacidad, y se apoya en el catálogo de casos TES-001…038 de Profit Plus.

## Diagnóstico

`app/(app)/treasury/page.tsx` concentra 889 líneas en un solo componente cliente:

- ~125 `useState` y una única función `load()` que, en cada cambio de filtro o página de **cualquier** sección, vuelve a pedir cuentas, bancos, beneficiarios, chequeras, cheques, entregas, depósitos, cobranzas elegibles, órdenes de pago, historial de liquidaciones, un saldo por cuenta (N peticiones) y el libro. Paginar cheques recarga saldos y depósitos.
- Catorce bloques apilados sin jerarquía: resumen por estado, consulta de libro y de cheques, altas, órdenes pendientes, historial de liquidaciones, reportes, saldos, cuentas + movimientos, beneficiarios, depósitos, chequeras, cheques emitidos, entrega masiva e historial de entregas.
- El usuario aterriza en formularios de filtro vacíos («0 movimientos», «0 cheques») en lugar de un resumen operativo.
- `fetch` + token Supabase + cabeceras duplicados en cada handler, aunque existe `RemoteTreasuryPort` (`packages/kernel/remote/src/domains/treasury`) y un precedente Web de transporte remoto (`src/modules/workspace/frontend/web-operation-context.ts`).
- `MODULE_SUBNAV.treasury` (`src/shared/frontend/navigation.ts:90`) ya declara Conciliación y Política tributaria, pero la captura de producción solo muestra «Tablero». Verificar si producción corre un build anterior o si el filtro de permisos del sidebar los oculta; resolverlo en la fase T0.

### Comprobación Supabase (MCP, solo lectura, 2026-10-22)

- Migraciones Treasury aplicadas: `treasury_foundation`, `treasury_module_catalog`, `treasury_reconciliation_read_versions`, `treasury_tax_policy_reads`. 22 tablas `shared_treasury_*`; módulo `treasury` activo para `web`.
- `shared_treasury_query` admite: `get_balance`, `get_payment_order_execution`, `get_reconciliation_preview`, `list_bank_accounts`, `list_bank_debit_tax_assessments`, `list_bank_debit_tax_policies`, `list_banks`, `list_beneficiaries`, `list_cash_boxes`, `list_check_deliveries`, `list_checkbooks`, `list_checks`, `list_deposits`, `list_eligible_collections`, `list_exchange_differences`, `list_ledger_entries`, `list_reconciliation_history`, `list_reconciliation_items`, `list_reconciliation_rules`, `list_reconciliation_statements`, `treasury_report`. Cada página propuesta tiene consulta existente; no hace falta backend nuevo. No existe `list_balances`: el saldo sigue siendo una petición por cuenta.
- Las órdenes de pago no salen de `shared_treasury_query`; se siguen leyendo por `/api/security/payment-orders`.
- Permisos existentes: `treasury.read|post|reverse|checks|reconcile|manage|tax.configure` y `payment_orders.read|create|update|delete|void`. `treasury.tax.configure` debe condicionar las acciones de `/treasury/tax-policy`.
- Todas las tablas `shared_treasury_*` están vacías: no hay datos de producción que migrar ni riesgo de regresión de datos; las pruebas requerirán datos sembrados en una empresa piloto.

## Arquitectura de información

Agrupación por contexto de trabajo, siguiendo el patrón de los demás módulos (`Tablero` sin grupo, luego `Operaciones`, `Catálogos`, `Reportes`, `Configuración`).

| Grupo | Ruta | Página | Casos TES | Contenido que se mueve del tablero actual |
| --- | --- | --- | --- | --- |
| — | `/treasury` | Tablero | 007 | KPIs: saldo por moneda, cheques por entregar, borradores pendientes, órdenes por pagar, partidas sin conciliar. Saldos por cuenta (tarjetas) con enlace al detalle. Accesos rápidos. «Resumen por estado» pasa aquí como indicadores. |
| Operaciones | `/treasury/movements` | Movimientos | 008–013, 036, 037 | Libro con selector de cuenta, filtros (fechas, tipo, origen, responsable, estado), paginación, publicar borrador, reverso con motivo. Botón «Nuevo movimiento» abre un panel lateral. |
| Operaciones | `/treasury/checks` | Cheques | 014, 016–020 | Pestañas: *Emitidos* (consulta con filtros actuales + emitir), *Por entregar* (entrega individual y masiva), *Historial de entregas*. |
| Operaciones | `/treasury/deposits` | Depósitos | 021, 022 | Listado de depósitos + «Nuevo depósito» con modo caja→banco o agrupación de cobranzas elegibles. |
| Operaciones | `/treasury/payments` | Órdenes y pagos | 023–026 | Órdenes pendientes con estado de liquidación, ejecutar pago, historial de liquidaciones. La administración de borradores sigue en `/settings/payment-orders`; se enlaza desde aquí. |
| Operaciones | `/treasury/reconciliation` | Conciliación bancaria | 028–032 | Existente; solo se adapta a la navegación y al cliente común. |
| Catálogos | `/treasury/accounts` | Cajas y cuentas | 001–007 | Listado unificado con tipo, moneda, estado y saldo a fecha. Altas de caja, banco y cuenta en diálogos. |
| Catálogos | `/treasury/accounts/[accountId]` | Detalle de cuenta | 002, 005, 007, 037 | Ficha, saldo a fecha, últimos movimientos (enlace a Movimientos prefiltrado), chequeras de la cuenta. |
| Catálogos | `/treasury/checkbooks` | Chequeras | 015, 017 | Listado con rango, próximo folio y disponibilidad; alta de chequera. |
| Catálogos | `/treasury/beneficiaries` | Beneficiarios | 027 | Listado con referencias bancarias enmascaradas y alta. |
| Reportes | `/treasury/reports` | Reportes | 038 | Selector de las siete familias, rango, cuenta, moneda y formato CSV/PDF (lógica actual de `exportTreasuryReport`). |
| Configuración | `/treasury/tax-policy` | Política tributaria (IDB) | 034, 035 | Existente. |

TES-033 (diferencia cambiaria) **no** recibe página hasta resolver tasa verificable y regla contable aprobada, como establece el plan de producción. Se reserva `/treasury/valuation` sin publicarla en el menú.

### Decisiones de navegación

- **Contexto en la URL**: cuenta, fechas, estado y página viven en `searchParams` (`/treasury/movements?account=…&from=…&status=draft&page=2`). Permite compartir enlaces, volver atrás sin perder filtros y enlazar desde el tablero y el detalle de cuenta.
- **Formularios de alta** en panel lateral o diálogo dentro de la página dueña; no rutas `/new` salvo depósitos con cobranzas si el flujo crece.
- **Permisos por página**: cada ruta se registra en `module-access-policy.ts` con su permiso de lectura (`treasury.read`; `payment_orders.read` adicional para `/treasury/payments`). Las acciones siguen condicionadas por `can("treasury.post" | "treasury.checks" | "treasury.reverse" | "treasury.manage")` dentro de la página.
- **Breadcrumb** `Inicio › Tesorería › <página>` lo resuelve el layout existente a partir de `MODULE_SUBNAV`.

## Estructura de código

Sigue las reglas del freeze Web: no se mueven `app`/`src`; la lógica de negocio sigue en `@kontave/treasury` y el servidor.

```
app/(app)/treasury/
  layout.tsx                 # TreasuryClientProvider (org + empresa + cliente remoto)
  page.tsx                   # Tablero
  movements/page.tsx
  checks/page.tsx
  deposits/page.tsx
  payments/page.tsx
  accounts/page.tsx
  accounts/[accountId]/page.tsx
  checkbooks/page.tsx
  beneficiaries/page.tsx
  reports/page.tsx
  reconciliation/page.tsx    # existente
  tax-policy/page.tsx        # existente
src/modules/treasury/frontend/
  treasury-client.ts         # RemoteTreasuryPort + transporte Web (token Supabase, x-kontave-client)
  context/treasury-context.tsx
  hooks/use-treasury-catalogs.ts   # cuentas, bancos, beneficiarios, chequeras (paginación por 500, límite 10.000)
  hooks/use-treasury-balances.ts
  hooks/use-ledger.ts
  hooks/use-checks.ts
  hooks/use-check-deliveries.ts
  hooks/use-deposits.ts
  hooks/use-payment-orders.ts
  hooks/use-treasury-filters.ts    # lectura/escritura tipada de searchParams
  components/                      # tablas, formularios y diálogos por capacidad
```

Reglas:

- **Un hook por consulta**: cada página carga solo lo que muestra. Los catálogos compartidos (cuentas, bancos, beneficiarios, chequeras) se cargan una vez en el contexto del layout y se invalidan tras comandos que los modifican.
- **Saldos**: el tablero y la lista de cuentas son los únicos consumidores de `get_balance`. Si N peticiones por cuenta resulta costoso, proponer una consulta aditiva `list_balances` en una fase backend separada; no bloquea este plan.
- **Comandos**: un único `useTreasuryCommand()` que gestiona idempotencia (`idempotencyKey`/`correlationId`), regeneración de claves en 409 e invalidación de las consultas afectadas. Sustituye los cinco patrones duplicados actuales.
- **Tipos**: reemplazar los `type` locales del archivo por los DTO de `@kontave/client-contracts` decodificados por `RemoteTreasuryPort`.
- `presentation-registry.ts` marca Treasury como `planned`; actualizarlo a activo solo si el contrato de ese estado se cumple (pendiente de la revisión técnica n.º 4 del plan de producción).

## Fases

Cada fase deja producción funcional: el tablero antiguo sigue respondiendo hasta que todas sus secciones tengan destino.

| Fase | Entregable | Criterio de salida |
| --- | --- | --- |
| T0 — Base | Diagnóstico del sidebar (por qué no aparecen Conciliación/Política). `treasury-client.ts`, contexto en `layout.tsx`, `useTreasuryCommand`, hook de catálogos y de filtros en URL. Sin cambios visibles. | `pnpm build` y lint verdes; el tablero actual migrado a usar el cliente común sin cambio funcional. |
| T1 — Catálogos | `/treasury/accounts`, detalle de cuenta, `/treasury/checkbooks`, `/treasury/beneficiaries`. Altas en diálogos. | TES-001–007, 015, 027 operables desde su página; se eliminan del tablero. |
| T2 — Movimientos | `/treasury/movements` con filtros en URL, borrador/publicación/reverso y panel de alta. | TES-008–013, 036, 037; navegación atrás conserva filtros. |
| T3 — Cheques y depósitos | `/treasury/checks` (3 pestañas) y `/treasury/deposits`. | TES-014, 016–022; lote de entrega conserva límite de 100 y resultados por cheque. |
| T4 — Pagos y reportes | `/treasury/payments` y `/treasury/reports`. Enlace cruzado con `/settings/payment-orders`. | TES-023–026, 038; usuarios sin `payment_orders.read` no ven la página ni el ítem. |
| T5 — Tablero nuevo | Reescribir `/treasury` como resumen: KPIs, saldos, pendientes y accesos rápidos. Ajustar conciliación y política tributaria al cliente común. | `page.tsx` del tablero < 250 líneas; ninguna sección de operación queda en el tablero. |
| T6 — Cierre | Menú, iconos (`sidebar-subnav.tsx`), permisos de ruta, estados vacíos con llamada a la acción, documentación. | Revisión visual en escritorio y móvil; smoke test por rol (lectura, operador, administrador). |

T1, T2 y T3 son independientes una vez cerrada T0 y pueden asignarse a escritores distintos (un escritor por archivo; el de navegación/permisos es uno solo).

## Cambios en archivos compartidos

| Archivo | Cambio |
| --- | --- |
| `src/shared/frontend/navigation.ts` | Ampliar `MODULE_SUBNAV.treasury` con las rutas y grupos de la tabla. |
| `src/shared/frontend/components/sidebar-subnav.tsx` | Iconos: `ArrowLeftRight` movimientos, `Banknote` cheques, `PiggyBank` depósitos, `HandCoins` pagos, `WalletCards` cuentas, `BookCopy` chequeras, `UserRound` beneficiarios, `BarChart3` reportes, `GitCompare` conciliación, `Percent` política. |
| `src/modules/organizations/frontend/module-access-policy.ts` | Registrar cada ruta con sus permisos de lectura. |

## Validación

1. `pnpm lint`, `pnpm build` y pruebas del paquete `@kontave/treasury` y de `@kontave/remote` afectadas.
2. Smoke manual por página con una empresa piloto: alta, consulta filtrada, paginación, comando con 409 simulado y reintento.
3. Verificar en DevTools que cambiar de página o filtro solo dispara las consultas de esa página.
4. Roles: sin `treasury.post` no aparecen acciones de publicación; sin `payment_orders.read` no aparece Órdenes y pagos.

## Fuera de alcance

- TES-033 y cualquier cambio de contratos o SQL.
- Rediseño del módulo de conciliación más allá de adaptarlo a la navegación.
- Mover la administración de órdenes de pago fuera de Configuración (se decidirá tras T4).

## Seguimiento de implementación

- Base T0: `TreasuryClientProvider`, catálogos compartidos, `useTreasuryCommand` con identidad estable de reintento y filtros en `searchParams` implementados. Tablero y política tributaria consultan el cliente común; Conciliación usa el cliente común para lecturas.
- T1: listados de cajas/cuentas, bancos, beneficiarios y chequeras; formulario de alta y ficha de cuenta con saldo, chequeras y enlace a movimientos implementados.
- T2: consulta de libro filtrada por cuenta, fechas y estado; borrador, publicación y reverso implementados.
- T3: `/treasury/checks` con pestañas *Emitidos* (emisión, entrega y anulación individual), *Por entregar* (entrega masiva de hasta 100 cheques con resultado por cheque; los fallidos quedan seleccionados) e *Historial de entregas*. `/treasury/deposits` registra depósitos caja→banco o agrupando cobranzas elegibles de la moneda de destino (selección entre páginas, monto exacto por suma de disponibles).
- T4: ejecución de orden mediante efectivo (caja), débito bancario o cheque ya emitido/entregado de la cuenta por el mismo monto y moneda; historial de liquidaciones paginado; reportes CSV/PDF. Administración de órdenes conserva su enlace a Configuración.
- T5/T6: tablero operativo nuevo, páginas registradas en navegación y política de acceso, e iconos disponibles implementados. Conciliación y Política tributaria envían todos sus comandos por `useTreasuryCommand`; no queda `fetch` directo a comandos de Tesorería en la Web.
- `useTreasuryCommand` conserva clave de idempotencia, correlación e identificador del recurso creado mientras el resultado es desconocido (red, respuesta inválida, 5xx) y los descarta ante una respuesta definitiva del dominio; cada operación se distingue por clave. El lote de entregas conserva por cheque la misma identidad hasta recibir su resultado.
- Correcciones de base detectadas durante el cierre: el decodificador de `RemoteTreasuryPort` rechazaba filas `reconciliation_rule`, `reconciliation_statement`, `bank_debit_tax_policy`, `bank_debit_tax_assessment` y `payment_order_execution` (Conciliación, Política tributaria y Pagos fallarían con datos reales); `TreasuryCommandRequest` describía montos con la valuación que deriva el servidor en lugar de la forma JSON real (`{ amount, currency }`), corregido solo a nivel de tipos, sin cambio de endpoint, JSON ni SQL; los catálogos se refrescan tras cualquier comando que escriba libro, porque el disparador incrementa la versión de la cuenta.

Validación: `tsc --noEmit` de la raíz sin errores en Tesorería (con `app/(app)/fiscal/declaraciones/page.tsx` excluido por un `` `r`n `` literal ajeno a este trabajo), ESLint sin avisos en los archivos de Tesorería, `@kontave/treasury` 44/44 y `@kontave/client-remote` 135/135 pruebas. `pnpm build` sigue bloqueado porque falta `baseline-browser-mapping` en `node_modules`. Pendiente: smoke visual en escritorio/móvil y por rol con una empresa piloto sembrada (las tablas `shared_treasury_*` están vacías).
