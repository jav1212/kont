# Plan de contabilidad general (plan de cuentas y maestros): packages primero, Web después

Fecha de análisis: 2026-10-23. Estado actual (2026-10-26): **P2–P6 aplicadas/implementadas; W1 con build/lint en verde; W2 y W3 parciales; T10 documentado; pendiente cerrar código y validaciones humanas**. Ejecutor: Codex, con los roles de `.codex/agents/`.

## Seguimiento de ejecución (2026-10-26)

- **P1:** núcleo `@kontave/accounting` implementado; `pnpm --filter @kontave/accounting check` y sus 38 pruebas pasaron. La puerta no cierra: sigue pendiente que el contador apruebe la plantilla VEN-NIF.
- **P2 — aplicada:** `node supabase/checks/accounting-pglite.mjs` pasó, incluidas pruebas de las RPC legacy (crear, editar, convertir e importar), D9 y recodificación de subárbol. Aplicadas `20261026131735_accounting_chart_persistence`, `20261026131930_accounting_memorandum_counterpart_index`, `20261026132419_accounting_dimensions`, `20261026151445_accounting_dimension_foreign_key_indexes`, `20261026134135_accounting_auxiliaries`, `20261026135757_accounting_settings`, `20261026151732_accounting_routine_security` y `20261026152246_accounting_delegated_authorization`. Cada migración se validó con `execute_sql` en `begin/rollback`; tras cada aplicación se comprobaron `list_migrations` y los tres smokes de nómina, compras y configuración CxP. El balance de las cuatro empresas con períodos disponibles quedó idéntico al baseline [T0 balance previo](../audit/accounting-trial-balance-before-2026-10-26.json). Solo cuatro de seis empresas con cuentas tienen período contable disponible para comparar; dos carecen de período.
- **P3/P4/P5 — aplicadas:** dimensiones, auxiliares y configuración contable instaladas mediante las migraciones indicadas en P2 y cubiertas en PGlite. El advisor quedó sin claves foráneas contables sin índice y sin los avisos de permisos/search_path para los helpers nuevos; se cerraron con las migraciones `20261026151732_accounting_routine_security` y `20261026151445_accounting_dimension_foreign_key_indexes`. Permanecen INFO por RLS sin política en tablas deliberadamente service-role-only; advertencias auth_rls_initplan y unused_index en policies/índices preexistentes requieren seguimiento operativo.
- **P6 — implementado:** contratos/puerto/kernel remote/runtime, composición cliente y registros de presentación Desktop/Mobile. `check` de contratos, remote, runtime y contabilidad pasaron; pruebas: remote 140/140, runtime 6/6, accounting 38/38.
- **W1 — implementado; HTTP pendiente:** rutas autenticadas y factory servidor. `corepack pnpm build` terminó correctamente; `corepack pnpm lint` terminó sin errores. La validación SQL de autorización delegada pasó con `service_role`; falta prueba HTTP de integración.
- **W2 — formularios implementados; piloto pendiente:** valores de atributos, activación de fuentes auxiliares, perfil contable y monedas tienen formularios de escritura. Build y lint pasan; ESLint reporta 328 warnings preexistentes.
- **W3 — correcciones deterministas aplicadas:** plan creado/activado en `J506935210`; 13 cuentas asignadas ahí y 3 a `J-40548909-0` mediante `assign_account_to_chart`, conservando IDs y balance. Seis padres ausentes y cuatro tipos incompatibles siguen intactos a la espera de aprobación; ver [cierre W3](../audit/accounting-w3-2026-10-26.md).
- **T10 — documentación parcial:** ADR 0047, README del paquete, auditoría W3, [guía operativa](accounting-operations.md) y [guion de piloto](ACCOUNTING_PILOT.md) preparados. Falta consolidar los criterios de aceptación del contador y adjuntar evidencia del piloto humano.
- **Estado global:** código en cierre, pendiente de prueba HTTP W1, aprobación contable VEN-NIF, aprobación de los datos ambiguos y recorrido piloto.
## Objetivo y fuente

Implementar los 40 casos CON-001 a CON-040 como un bounded context portable en `packages/business/accounting` (`@kontave/accounting`), con persistencia compartida en Supabase y pruebas de comportamiento, y consumirlo después en la Web de producción (`app/(app)/accounting/**`) mediante composición servidor, rutas y presentación. Las factories Web ensamblan casos de uso del paquete; no reimplementan reglas de negocio.

Fuente leída: `C:\Users\hmolina\Downloads\ProfitPlus_CasosDeUso_Modulos_COMPLETO\29_contabilidad_general_plan_de_cuentas_y_maestros.md`. El archivo contiene solo identificadores y títulos, sin actores, reglas, estados ni fórmulas. Los contratos y criterios de aceptación de este plan son **propuestas** que P0 debe especificar con el contador. No describen el funcionamiento interno de Profit Plus.

Alcance: solo **maestros y configuración**. Asientos, períodos, mayor, balances, cierres y estados financieros pertenecen a otros archivos del catálogo y quedan fuera, pero **no deben romperse**: hoy dependen de las mismas tablas de cuentas.

## Evidencia actual (repositorio y Supabase de solo lectura, 2026-10-23)

| Evidencia | Hallazgo | Consecuencia |
| --- | --- | --- |
| `src/modules/accounting/**` | Módulo Web legacy completo (dominio, 15 comandos, 8 consultas, repositorios `Shared*Repository` sobre RPC `shared_accounting_*`, hooks y PDF de balance y resultados). `Account` tiene `type` (`asset/liability/equity/revenue/expense`), `parentCode`, `isGroup`, `isActive`, `saldoInicial` y `chartId` opcional. No hay estructura de código, naturaleza, cuentas de orden, clase monetaria, centros de costo, auxiliares, atributos ni configuración. | El paquete nuevo **absorbe** el modelo de cuentas y planes; el legacy se convierte en consumidor y luego se retira (W1). Hay un solo escritor al final. |
| `public.shared_accounting_charts` / `shared_accounting_accounts` (migración 131 y 140) | **5 planes, 2.129 cuentas** (677 agrupadoras, 0 inactivas) en **6 empresas**; 16 cuentas sin plan. Tipos: 1.119 gasto, 434 activo, 390 pasivo, 93 patrimonio, 93 ingreso. Códigos con hasta 5 segmentos separados por punto (`1.1.01.02.003`, `5.2.01.01.004`, `6.5.01.01`). | Hay datos reales que la estructura (CON-002) debe aceptar. P0 audita códigos, padres huérfanos y prefijos antes de imponer la máscara. Ninguna regla nueva se aplica retroactivamente sin un reporte de no conformidad. |
| `shared_accounting_entries` / `_entry_lines` / `_periods` | 4 asientos, 14 líneas, 4 períodos. 0 reglas de integración legacy. | Las reglas "sin movimientos" (CON-007) y "detalle ↔ totalizadora" se verifican contra líneas reales, aunque hoy casi no existen. |
| `@kontave/accounting-integration` y migraciones 340–349 y `20261023191644_payables_accounting_integration.sql` | Nómina, compras y CxP publican asientos VES leyendo `shared_accounting_accounts`; las RPC rechazan cuentas inactivas y agrupadoras. | Las cuentas son una **dependencia publicada**. Toda columna nueva es aditiva, `id`/`code`/`is_group`/`is_active` conservan semántica y la eliminación debe comprobar referencias de reglas de integración (nómina, compras, CxP). |
| `@kontave/companies` (`CompanyMonetaryPolicy`) y `@kontave/monetary` (ADR 0011, 0012) | La empresa ya posee moneda operativa, monedas de referencia, fuente de tasa y redondeo, versionados. Monetary resuelve tasas BCV. | CON-034–036 **no crean** un segundo catálogo de monedas ni una segunda tabla de tasas. Contabilidad declara su moneda funcional (VES) y sus monedas de reporte sobre las definiciones existentes. |
| `packages/business/sales` (`Customer`), `purchasing` (`Supplier`), `shared_inventory_suppliers` (proveedor Web de producción), `employees`, `treasury` (beneficiarios) | Los terceros ya tienen dueño. | Los auxiliares CON-025–028 son **referencias** a esos maestros mediante puertos de lectura; contabilidad solo es dueña de "otros auxiliares" (CON-029). |
| Web `app/(app)/accounting/**` | 8 páginas: hub, `accounts` (994 líneas), `charts` (927), `journal` (+`new`, `[id]`), `periods`, `trial-balance`, `financial-statements`, `integrations`. `layout.tsx` vacío. | `accounts` y `charts` se reemplazan; el resto se mantiene y solo cambia su fuente de cuentas. |
| Búsqueda `cost center`/`centro de costo` en código y migraciones | Sin resultados. | Centros de costo, clasificaciones de gasto, atributos, tipos de documento y cuentas especiales son capacidades nuevas. |

## Decisiones de arquitectura propuestas

1. **Nuevo workspace `@kontave/accounting` en `packages/business/accounting`.** Frontera de propiedad ([ADR 0035](../adr/0035-bounded-context-package-granularity.md)): el plan de cuentas y sus maestros son el lenguaje del libro mayor; `accounting-integration` es un *consumidor* que traduce eventos de otros contextos a asientos. No se fusionan. Más adelante, asientos y períodos se mudan a este mismo paquete (otro plan). Redactar **ADR 0047 "Plan de cuentas y maestros contables"**.
2. **Dependencias:** `@kontave/monetary` (códigos de moneda y tasas), `@kontave/companies` (solo `CompanyId` y lectura de política monetaria) y, en adaptadores, `@supabase/supabase-js`. **No** depende de `sales`, `purchasing`, `employees`, `treasury`, `payables` ni `accounting-integration`. Los auxiliares externos entran por un puerto `AuxiliarySourceReader` que la Web compone. `accounting-integration` podrá depender de `@kontave/accounting/domain` (dirección permitida), nunca al revés.
3. **Un plan activo por empresa.** Hoy el modelo permite varios planes; los asientos referencian `account_id`, por lo que dos planes activos hacen ambiguo el balance. Propuesta: estado del plan `draft | active | archived`, uno solo `active` por empresa; los demás sirven como borrador o plantilla para copiar (D2).
4. **Estructura de código versionada por plan (CON-002).** `CodeStructure` = lista ordenada de segmentos (longitud y separador). El código de una cuenta debe encajar en un nivel de la máscara; su padre es el prefijo del nivel inmediato superior. El nivel se **deriva** del código, no se guarda editable. La estructura solo se puede cambiar si ninguna cuenta queda fuera de ella (validación previa con reporte).
5. **Clasificación en dos ejes, aditiva sobre `type`:** `type` conserva los cinco valores (activo, pasivo, patrimonio, ingreso, egreso) para no romper reportes ni RPC existentes. Se añaden `is_memorandum` (cuenta de orden, CON-015, excluida de estados financieros, con contrapartida deudora/acreedora), `normal_balance` (`debit|credit`, derivado del tipo con excepción explícita para cuentas reguladoras) y `monetary_class` (`monetary|non_monetary`, CON-016/017; base del ajuste por inflación). Hijos heredan `type`, `is_memorandum` y `monetary_class` del padre salvo excepción auditada.
6. **Detalle frente a totalizadora (CON-008/009).** Solo una cuenta de detalle (hoja) acepta líneas de asiento, centros de costo, auxiliares y atributos. Una totalizadora no puede tener líneas ni saldo propio. Convertir detalle → totalizadora exige cero líneas; totalizadora → detalle exige cero hijos.
7. **Dimensiones analíticas como políticas de la cuenta.** Cada cuenta de detalle declara qué exige al contabilizar: `costCenterPolicy` (`none|optional|required` + lista permitida, CON-021), `auxiliaryPolicy` (tipo de auxiliar `none|customer|supplier|employee|beneficiary|other` + obligatoriedad, CON-024–029) y atributos asociados con obligatoriedad (CON-033). El motor de asientos futuro valida contra estas políticas; este plan solo las define y las expone.
8. **Moneda contable (CON-034–036).** La moneda funcional de los libros es VES por defecto e inmutable mientras existan asientos (D4). Las monedas adicionales son **monedas de reporte** elegidas entre las definiciones de `companies`/`monetary`. Las tasas se leen del proveedor existente; si P0 confirma que no hay tasas manuales, la captura manual se implementa en el dueño de tasas (`monetary`/`exchange-rates`), no en contabilidad.
9. **Configuración contable versionada (CON-037–040).** `AccountingSettings` por empresa, inmutable por revisión (patrón de `CompanyMonetaryPolicy`): mapa `rol especial → cuenta` (resultado del ejercicio, utilidades no distribuidas, cierre de ingresos/egresos, ajuste fiscal por inflación, REI/reexpresión financiera, diferencial cambiario) y perfil contable de empresa (contador, CPC, registro mercantil, inicio del ejercicio, campos adicionales tipados). Una cuenta referida por un rol no se elimina ni se inactiva.
10. **Escritor único y comando por `kind`.** RPC `shared_accounting_execute_command(p_scope, p_command)` y `shared_accounting_query(p_scope, p_query)` (STABLE), `SECURITY DEFINER`, ejecutables solo por `service_role`, igual que tesorería y CxP. Las RPC legacy (`shared_accounting_account_upsert`, `_delete`, importación de plan) pasan a envolver el comando nuevo en W1 o se retiran cuando la Web deje de llamarlas; nunca coexisten dos validadores divergentes.
11. **Kernel portable** ([ADR 0033](../adr/0033-portable-client-orchestration.md)): contratos `domains/accounting` en `@kontave/client-contracts`, puerto remoto y feature en runtime, clasificados `planned` en Desktop y Mobile.

## Modelo de dominio propuesto

| Elemento | Responsabilidad | Invariantes clave |
| --- | --- | --- |
| `ChartOfAccounts` (agregado) | Plan de cuentas de una empresa: nombre, estado (`draft/active/archived`), `CodeStructure`, versión. | Un único plan `active` por empresa. La estructura acepta todas sus cuentas. Un plan con asientos no se elimina, solo se archiva si no es el activo. |
| `CodeStructure` | Segmentos con longitud y separador; deriva nivel y código padre. | 1–9 niveles; longitud total ≤ 30; cambiarla no deja cuentas fuera. |
| `LedgerAccount` | Cuenta: código, nombre, padre, `kind` (`detail/summary`), `type`, `is_memorandum`, `normal_balance`, `monetary_class`, estado, políticas de dimensiones y versión. | Código único por plan y conforme a la máscara; padre existente, totalizadora y del mismo `type`. Un hijo activo exige padre activo. Eliminar exige cero líneas, cero hijos y ninguna referencia (reglas de integración, roles especiales, asociaciones). |
| `CostCenter` | Centro de costo jerárquico con código, nombre, padre, estado. | Código único por empresa. Solo los de detalle se asignan. Se elimina sin uso; con uso, solo se inactiva (CON-020). |
| `ExpenseClassification` | Clasificación o "cuenta de gasto" administrativa (CON-022) enlazada a una cuenta contable de egreso de detalle (CON-023). | La cuenta enlazada es de detalle, activa y `type = expense`. |
| `AccountingAuxiliary` | Tercero analítico: `kind` + referencia al maestro dueño (`customer:<id>`, `supplier:<id>`, `employee:<id>`, `beneficiary:<id>`) o registro propio (`other`, CON-029) con código, nombre y RIF/cédula opcional. | Único por `(empresa, kind, sourceId)`. Contabilidad no edita datos del tercero externo; solo lo habilita o inhabilita como auxiliar. |
| `AccountingDocumentType` | Tipo de comprobante (diario, nómina, compras, ventas, ajuste, apertura, cierre…) con código, prefijo y política de numeración (CON-030). | Código único; los tipos de sistema no se eliminan; un tipo usado no cambia su prefijo. |
| `AccountingAttribute` / `AttributeValue` / `AccountAttributeLink` | Dimensión libre (CON-031), sus valores (CON-032) y su asociación a cuentas con obligatoriedad (CON-033). | Valor único por atributo; atributo de tipo `list|text|date|number`; desasociar no borra valores ya usados. |
| `AccountingCurrencySettings` | Moneda funcional y monedas de reporte (CON-034/035), con la fuente de tasa heredada (CON-036). | Moneda funcional inmutable con asientos; las de reporte existen en la política monetaria de la empresa. |
| `AccountingSettings` | Revisión inmutable con roles especiales (CON-037–039) y perfil contable de empresa (CON-040). | Cada rol apunta a una cuenta de detalle activa del plan activo y del tipo esperado (por ejemplo, resultado del ejercicio = patrimonio). |
| `AccountingFailure` | Errores tipados: `INVALID`, `FORBIDDEN`, `NOT_FOUND`, `VERSION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `CODE_OUT_OF_STRUCTURE`, `DUPLICATE_CODE`, `PARENT_INVALID`, `TYPE_MISMATCH`, `HAS_POSTINGS`, `HAS_CHILDREN`, `IN_USE`, `ACTIVE_CHART_CONFLICT`, `UNAVAILABLE`. | Traducción 1:1 desde códigos SQL en el adaptador. |

## Contratos e invariantes transversales

1. **Alcance:** actor tomado de la sesión; organización, empresa y tenant validados en SQL; claves compuestas por `(tenant_id, company_id)`.
2. **Idempotencia y concurrencia:** clave idempotente + huella de intención por comando; `expectedVersion` y `SELECT … FOR UPDATE` en orden determinista (plan → cuenta padre → cuenta). Crear dos hijos del mismo padre a la vez no viola unicidad ni nivel.
3. **Inmutabilidad útil:** cuentas con movimientos no cambian `type` ni `kind`; sí nombre y políticas (con historial en auditoría). El código solo cambia con el comando explícito `recode_account` (D7): conserva el `id` y los movimientos, valida la estructura y la jerarquía, y queda auditado con código anterior y nuevo.
4. **Auditoría:** ampliar el vocabulario `entity_type` con `accounting_chart`, `accounting_account`, `cost_center`, `expense_classification`, `accounting_auxiliary`, `accounting_document_type`, `accounting_attribute`, `accounting_settings`.
5. **Permisos (verificar nombres vigentes en P0):** `accounting.read` existente; nuevos `accounting.chart.manage` (CON-001–017) y `accounting.masters.manage` (CON-018–033), `accounting.configure` (CON-034–040). Instalación limpia sin presembrar.
6. **TSDoc completo**, imports sin `.js` y ninguna carpeta `utils`/`helpers` (AGENTS.md).

## Matriz completa de ejecución

Estado inicial: **N** = nueva; **P** = base parcial reutilizable en el legacy. Ninguna fila está aceptada.

| ID | Caso de uso | Estado / fase | Criterio de aceptación propuesto |
| --- | --- | --- | --- |
| CON-001 | Crear plan de cuentas | P / P1 | Crea plan `draft` con estructura; vacío, desde plantilla VEN-NIF de Kontave, copia de otro plan o importación CSV (reutiliza el parser legacy movido al paquete). Activar exige estructura válida y archiva el activo anterior solo si no tiene asientos (D2). |
| CON-002 | Definir estructura jerárquica del código | N / P1 | Editar segmentos; vista previa con cuentas no conformes; se rechaza si alguna cuenta queda fuera. |
| CON-003 | Crear cuenta contable | P / P1 | Código conforme, padre totalizadora existente del mismo tipo, hereda clasificación; idempotente. |
| CON-004 | Consultar cuenta contable | P / P1 | Ficha con clasificación, jerarquía, políticas, referencias (reglas, roles) y conteo de movimientos; búsqueda por código o nombre. |
| CON-005 | Modificar cuenta contable | P / P1 | Con versión. `type` y `kind` bloqueados con movimientos (`HAS_POSTINGS`). Recodificación mediante `recode_account` (D7), que conserva `id` y movimientos y reubica a los hijos en la jerarquía. |
| CON-006 | Inactivar cuenta contable | P / P1 | Una cuenta inactiva no acepta nuevas líneas ni reglas; inactivar una totalizadora exige hijos inactivos; rechazada si es rol especial. Reactivar exige padre activo. |
| CON-007 | Eliminar cuenta sin movimientos/dependencias | P / P1 | Solo con cero líneas, cero hijos, cero referencias (reglas nómina/compras/CxP, roles, asociaciones). Mensaje lista la dependencia. |
| CON-008 | Crear cuenta de detalle | P / P1 | `kind = detail`; conversión desde totalizadora sin hijos. |
| CON-009 | Crear cuenta totalizadora | P / P1 | `kind = summary`; conversión desde detalle sin líneas. Su saldo se calcula, nunca se contabiliza. |
| CON-010–014 | Clasificar como activo, pasivo, patrimonio, ingreso, egreso | P / P1 | Tipo obligatorio en primer nivel y heredado; cambio solo sin movimientos y en cascada sobre hijos sin movimientos. `normal_balance` derivado, con excepción explícita para reguladoras (depreciación acumulada). |
| CON-015 | Manejar cuenta de orden | N / P1 | `is_memorandum`; deudoras y acreedoras de orden en pares; excluidas de balance general y resultados existentes (`financial-statements.ts` las filtra, prueba de regresión). |
| CON-016 | Definir cuenta monetaria | N / P1 | `monetary_class = monetary`; heredable; reporte de cuentas no clasificadas. |
| CON-017 | Definir cuenta no monetaria | N / P1 | Igual con `non_monetary`; requerida por el futuro ajuste por inflación (fuera de alcance). |
| CON-018 | Crear centro de costo | N / P3 | Jerárquico, código único por empresa. |
| CON-019 | Modificar centro de costo | N / P3 | Con versión; código inmutable con uso. |
| CON-020 | Eliminar/inactivar centro de costo | N / P3 | Eliminar sin uso; con uso o asociaciones, solo inactivar. |
| CON-021 | Asociar centro de costo a cuenta | N / P3 | Política `none/optional/required` y lista permitida en cuentas de detalle. |
| CON-022 | Crear clasificación de gasto | N / P3 | Catálogo con código, nombre y estado. |
| CON-023 | Asociar gasto a cuenta contable | N / P3 | Enlace a cuenta egreso de detalle activa; consulta inversa por cuenta. |
| CON-024 | Crear auxiliar | N / P4 | Alta de auxiliar por tipo; política de auxiliar en la cuenta. |
| CON-025 | Auxiliar de cliente | N / P4 | Habilita clientes existentes (puerto de ventas); no duplica datos. |
| CON-026 | Auxiliar de proveedor | N / P4 | Lee `shared_inventory_suppliers` (dueño Web vigente) vía puerto; mismo proveedor que CxP. |
| CON-027 | Auxiliar de trabajador | N / P4 | Lee empleados sin PII sensible (cédula y nombre únicamente). |
| CON-028 | Auxiliar de beneficiario | N / P4 | Lee beneficiarios de tesorería. |
| CON-029 | Otros auxiliares | N / P4 | CRUD propio de contabilidad (socios, entes públicos, etc.). |
| CON-030 | Crear tipo de documento contable | N / P5 | Tipos de sistema sembrados por instalación + tipos propios; prefijo y política de secuencia por empresa, tipo y período (D6). Este plan define la secuencia; su consumo al contabilizar pertenece al plan de asientos. |
| CON-031 | Crear atributo contable adicional | N / P3 | Atributo tipado con estado. |
| CON-032 | Crear valores de atributo | N / P3 | Valores únicos para atributos `list`. |
| CON-033 | Asociar atributos a cuentas | N / P3 | Asociación con obligatoriedad en cuentas de detalle. |
| CON-034 | Configurar moneda base contable | N / P5 | VES por defecto; inmutable con asientos (D4). |
| CON-035 | Crear moneda adicional | P / P5 | Selección de monedas de reporte de la política monetaria de la empresa; sin catálogo paralelo. |
| CON-036 | Mantener tasa de cambio | P / P5 | Consulta de tasas desde el proveedor existente; captura manual solo si el dueño de tasas la soporta (D5). |
| CON-037 | Cuentas especiales de cierre | N / P5 | Roles: resultado del ejercicio, utilidades no distribuidas, cierre de ingresos/egresos. Tipos validados. |
| CON-038 | Cuentas de ajuste fiscal | N / P5 | Roles de ajuste fiscal por inflación (LISLR) y reajuste regular; validación con el contador. |
| CON-039 | Cuenta de ajuste financiero | N / P5 | Rol REI/reexpresión (VEN-NIF) y diferencial cambiario. |
| CON-040 | Campos adicionales de empresa contable | N / P5 | Perfil contable versionado (contador, CPC, registro mercantil, inicio de ejercicio) + campos adicionales tipados; no duplica `companies` (RIF, razón social se leen). |

## Pantallas Web por dominio

Respuesta directa: **11 pantallas (rutas) nuevas o reemplazadas en 4 dominios**, más ~12 paneles laterales y la actualización del hub y la navegación. Las 6 pantallas de operación existentes (asientos ×3, períodos, balance de comprobación, estados financieros, integraciones) se conservan.

| Dominio | # | Ruta | Casos | Contenido |
| --- | --- | --- | --- | --- |
| **Plan de cuentas** (3) | 1 | `/accounting/charts` | CON-001 | Lista de planes con estado, conteo y acciones: nuevo (vacío, plantilla, copia, CSV), activar, archivar. Reemplaza la página actual. |
| | 2 | `/accounting/charts/[chartId]` | CON-002–003, 005–017 | Pestañas **Cuentas** (árbol con búsqueda, filtros por tipo/estado/orden/monetaria; panel lateral crear/editar/inactivar/eliminar/convertir) y **Estructura** (editor de segmentos con vista previa de no conformes). Reemplaza `/accounting/accounts`, que redirige al plan activo. |
| | 3 | `/accounting/accounts/[accountId]` | CON-004, 021, 033 | Ficha de cuenta: clasificación, jerarquía, políticas de centro de costo, auxiliar y atributos, referencias y conteo de movimientos. |
| **Dimensiones analíticas** (3) | 4 | `/accounting/cost-centers` | CON-018–021 | Árbol de centros con panel lateral; uso y cuentas asociadas. |
| | 5 | `/accounting/expense-classes` | CON-022–023 | Tabla de clasificaciones con su cuenta contable. |
| | 6 | `/accounting/attributes` | CON-031–033 | Atributos; panel lateral con valores y cuentas asociadas. |
| **Auxiliares** (1) | 7 | `/accounting/auxiliaries` | CON-024–029 | Pestañas Clientes, Proveedores, Trabajadores, Beneficiarios y Otros; habilitar/inhabilitar externos, CRUD de "otros". |
| **Configuración contable** (4) | 8 | `/accounting/settings/document-types` | CON-030 | Tipos de comprobante y numeración. |
| | 9 | `/accounting/settings/currencies` | CON-034–036 | Moneda funcional, monedas de reporte y tasas consultadas (enlace a la política monetaria de la empresa). |
| | 10 | `/accounting/settings/special-accounts` | CON-037–039 | Roles especiales agrupados: cierre, ajuste fiscal, ajuste financiero. |
| | 11 | `/accounting/settings/company` | CON-040 | Perfil contable de empresa. |

Si se prefiere menos rutas, 8–11 pueden ser pestañas de una sola `/accounting/settings` (quedarían **8 pantallas**); se recomienda rutas separadas por permisos distintos y enlaces profundos, como en `/treasury`.

Navegación: subnav "Contabilidad" agrupado como tesorería — **Operación** (resumen, asientos, períodos), **Reportes** (balance de comprobación, estados financieros), **Maestros** (plan de cuentas, centros de costo, clasificaciones de gasto, atributos, auxiliares), **Configuración** (tipos de documento, monedas, cuentas especiales, empresa, integraciones).

## Fases, dependencias y puertas de salida

Una fase no se completa con repositorios en memoria: necesita SQL real y pruebas.

| Fase | Depende de | Trabajo | Puerta de salida |
| --- | --- | --- | --- |
| **P0 — Especificación, auditoría y ADR** | Este plan | Auditoría SQL de las 2.129 cuentas: estructura inferible por plan, códigos no conformes, padres huérfanos, hijos de tipo distinto al padre, totalizadoras con líneas, empresas con más de un plan, cuentas referidas por reglas de nómina/compras/CxP. Inventariar consumidores de `shared_accounting_accounts` (RPC 340–349, CxP, `financial-statements.ts`, `trial-balance`). Confirmar nombres de permisos y soporte de tasa manual. Cerrar D1–D8 y redactar ADR 0047. | ADR aceptado, reporte de auditoría y decisiones cerradas por el usuario y el contador. |
| **P1 — Plan de cuentas (núcleo)** | P0 | Workspace (`package.json` con `check`/`test`, exports `./domain`, `./application`, `./supabase`, `./testing`). Dominio `ChartOfAccounts`, `CodeStructure`, `LedgerAccount`, clasificación y fallos. Casos CON-001–017 con puertos de repositorio y repositorio en memoria en `testing`. | Pruebas de dominio y aplicación de cada fila; `architecture check`. |
| **P2 — Persistencia del plan** | P1 | Migración aditiva: columnas en `shared_accounting_charts` (`status`, `code_structure jsonb`, `version`) y `shared_accounting_accounts` (`kind` derivado de `is_group`, `is_memorandum`, `normal_balance`, `monetary_class`, políticas, `version`); `shared_accounting_command_receipts`; RPC de comando y consulta; backfill seguro (estructura inferida, `monetary_class` nula = "sin clasificar"); auditoría. Adaptador Supabase, smoke PGlite y script PostgreSQL real. | CON-001–017 persistidos, aislados por tenant/empresa, idempotentes; reglas de integración existentes siguen publicando (smoke de nómina/compras/CxP en verde). |
| **P3 — Dimensiones** | P2 | Centros de costo, clasificaciones de gasto, atributos y valores, asociaciones a cuentas. Tablas `shared_accounting_cost_centers`, `_expense_classes`, `_attributes`, `_attribute_values`, `_account_dimensions`. | CON-018–023, 031–033. |
| **P4 — Auxiliares** | P2 | `AccountingAuxiliary` y puerto `AuxiliarySourceReader`; RPC de lectura que proyecta clientes, proveedores, trabajadores y beneficiarios sin copiar sus datos. | CON-024–029; prueba de que editar un proveedor se refleja sin sincronización. |
| **P5 — Configuración** | P2 | Tipos de documento con semilla de sistema, `AccountingCurrencySettings`, `AccountingSettings` (roles especiales y perfil). | CON-030, 034–040; borrar o inactivar una cuenta con rol se rechaza. |
| **P6 — Kernel portable** | P1–P5 | `domains/accounting` en contratos, remoto y runtime; clasificación `planned`. | `check` de los tres paquetes kernel. |
| **W1 — Composición servidor** | P2 (incremental por fase) | `src/modules/accounting/backend/accounting-factory.ts` compone el paquete (con `server-only`); `app/api/accounting/commands/route.ts` y `query/route.ts`; las rutas legacy de cuentas y planes delegan en el paquete; las RPC legacy de upsert/delete pasan a envolver el comando o se retiran. Puerto de auxiliares compuesto con los maestros reales. | `lint`, `build`; journal, períodos, balance y estados financieros sin regresión. |
| **W2 — Presentación** | W1 | Las 11 pantallas, layout con proveedor de cliente remoto (como `app/(app)/treasury/layout.tsx`), navegación y política de acceso. Filtros en `searchParams`; formularios en paneles laterales. | `lint`, `build`, recorrido piloto. |
| **W3 — Datos y piloto** | W2 | Ejecutar el reporte de no conformidad por empresa, corregir con el usuario, activar un plan por empresa, crear el plan de `J506935210` y asignarle sus 13 cuentas sin plan (D2), clasificar monetarias/no monetarias. Rollback = desactivar comandos nuevos y conservar lectura. | Una empresa piloto con plan activo conforme, dimensiones y roles configurados. |

P3, P4 y P5 son independientes entre sí tras P2 y pueden ir en paralelo (un escritor por migración y por carpeta del paquete).

## Decisiones que P0 debe cerrar (bloquean al ejecutor)

| # | Decisión | Propuesta por defecto | Responsable |
| --- | --- | --- | --- |
| D1 | Nombre y frontera del paquete | **Aceptada (2026-10-23):** `@kontave/accounting` en `packages/business/accounting`; asientos y períodos se mudan después a este paquete; `accounting-integration` sigue separado como consumidor y puede depender de `@kontave/accounting/domain`, nunca al revés. | Arquitectura |
| D2 | Planes por empresa | **Aceptada (2026-10-23):** un solo plan `active` por empresa, garantizado en SQL con índice único parcial `(tenant_id, company_id) where status = 'active'`; otros planes `draft/archived`. Evidencia: ninguna empresa tiene hoy más de un plan (5 empresas con 1 plan; `J506935210` con 13 cuentas sin plan, una con asiento). En W3 se crea un plan para esa empresa y se le asignan sus 13 cuentas; no se borra ninguna. | Producto/contabilidad |
| D3 | Clasificación egreso y costos | **Aceptada (2026-10-23):** `type` conserva sus 5 valores; `expense` cubre costos y gastos (subclasificación de costos en fase posterior). Cuentas de orden mediante `is_memorandum` con naturaleza deudora/acreedora, excluidas de estados financieros; no se añade un sexto valor a `type`. | Contabilidad |
| D4 | Moneda funcional | **Aceptada (2026-10-23):** VES fija (libros en bolívares); cambiarla solo sin asientos. Las monedas adicionales son solo de reporte (saldos convertidos con tasa y fecha explícitas); la contabilidad multimoneda por línea queda para el plan de asientos. | Contabilidad |
| D5 | Tasas manuales | **Aceptada (2026-10-23):** contabilidad consulta las tasas del proveedor existente. Si se requieren tasas manuales, la capacidad se añade en el módulo dueño de tasas, con fecha, fuente y trazabilidad; contabilidad solo las consume. | Producto |
| D6 | Numeración de comprobantes | **Aceptada (2026-10-23):** secuencia por empresa, tipo de comprobante y período. El número definitivo se asigna al contabilizar (un borrador no consume número); los números de comprobantes anulados se conservan para la trazabilidad y no se reutilizan. | Contabilidad |
| D7 | Cuentas fuera de estructura | **Aceptada (2026-10-23):** se conservan y se pueden consultar; un reporte muestra qué códigos o padres incumplen la estructura, y deben corregirse antes de activarla. Corregir un código (comando `recode_account`, auditado) conserva el `id` de la cuenta y todos sus movimientos. | Producto |
| D8 | `saldo_inicial` en la cuenta | **Aceptada (2026-10-23):** el valor histórico se conserva solo para lectura. Las aperturas nuevas se registran mediante asientos de apertura (plan de asientos). Antes de migrar saldos históricos a asientos, se concilian para no duplicarlos. | Contabilidad |

## Pruebas exigidas

- **Dominio:** máscara y derivación de nivel/padre, herencia de clasificación, conversiones detalle/totalizadora, inactivación en cascada, roles especiales con tipo inválido, auxiliar duplicado.
- **Aplicación:** cada fila de la matriz, permisos denegados, conflicto de versión, idempotencia (mismo y distinto payload), traducción de errores de puertos.
- **SQL:** `supabase/checks/accounting-pglite.mjs` y `scripts/test-accounting-postgres.mjs`: dos conexiones creando hijos del mismo padre, eliminar cuenta referida por una regla de nómina/compras/CxP, tenant ajeno con el mismo RIF, instalación limpia de permisos, lector sin permiso repitiendo un recibo, backfill sobre una copia de las 2.129 cuentas.
- **Regresión:** smokes existentes de publicación de nómina, compras y CxP; balance de comprobación y estados financieros idénticos antes y después de la migración en una empresa con datos.

```sh
corepack pnpm --filter @kontave/accounting check
corepack pnpm --filter @kontave/accounting test
corepack pnpm --filter @kontave/accounting-integration test
corepack pnpm --filter @kontave/architecture check
node supabase/checks/accounting-pglite.mjs
node scripts/test-accounting-postgres.mjs
# W1/W2
corepack pnpm lint
corepack pnpm build
```

## Paquetes de tareas para Codex

Según `AGENTS.md`: un escritor por archivo o paquete, como máximo tres especialistas en paralelo y `project_manager` solo para coordinar.

| # | Rol | Resultado | Rutas permitidas | Exclusiones | Validación |
| --- | --- | --- | --- | --- | --- |
| T0 | `project_manager` + `backend_engineer` (lectura) | Auditoría P0, inventario de consumidores, borrador ADR 0047 con D1–D8. | `docs/adr/0047-*.md`, `docs/audit/accounting-chart-*.json`, este plan | Código y migraciones | D1–D8 ya aceptadas; T0 entrega la auditoría y el ADR 0047 que las recoge, sin bloquear T1. |
| T1 | `backend_engineer` | Workspace `@kontave/accounting`, dominio y aplicación P1 con pruebas. | `packages/business/accounting/**` (salvo `adapters`) | `app/**`, `src/**`, otros paquetes | `check`, `test`, `architecture check`. |
| T2 | `backend_engineer` | Migración P2, adaptador Supabase, smoke PGlite, script PostgreSQL. | `supabase/migrations/<nuevo>`, `supabase/checks/accounting-*`, `scripts/test-accounting-postgres.mjs`, `packages/business/accounting/src/adapters/**` | Migraciones existentes | Smokes + regresión de integraciones. |
| T3 | `backend_engineer` | P3 dimensiones. | Paquete + migración propia | — | Puerta P3. |
| T4 | `backend_engineer` | P4 auxiliares. | Paquete + migración propia | Paquetes dueños de terceros | Puerta P4. |
| T5 | `backend_engineer` | P5 configuración. | Paquete + migración propia | `packages/business/companies/**` salvo lectura | Puerta P5. |
| T6 | `backend_engineer` | P6 kernel. | `packages/kernel/**` (`domains/accounting`) | — | `check` kernel. |
| T7 | `backend_engineer` | W1 factory y Route Handlers; delegación de rutas legacy. | `src/modules/accounting/backend/**`, `app/api/accounting/**` | Presentación | `build`; regresión de journal/trial-balance. |
| T8 | `web_engineer` | W2 pantallas 1–3 (plan de cuentas). | `app/(app)/accounting/{charts,accounts}/**`, `src/modules/accounting/frontend/**` | `app/api/**` | `lint`, `build`. |
| T9 | `web_engineer` | W2 pantallas 4–11, navegación y acceso. | `app/(app)/accounting/{cost-centers,expense-classes,attributes,auxiliaries,settings}/**`, `navigation.ts`, `module-access-policy.ts` | `app/api/**`, archivos de T8 | `lint`, `build`, recorrido piloto. |
| T10 | `documentation_engineer` | ADR final, README del paquete, `packages/README.md`, seguimiento de esta matriz. | `docs/**`, `packages/**/README.md` | Runtime | — |

Orden: T0 → T1 ∥ T2 (T2 solo migración y scripts hasta que T1 fije los puertos) → T3 ∥ T4 ∥ T5 → T6 ∥ T7 → T8 ∥ T9 → T10. T8 y T9 son escritores distintos porque no comparten archivos.

## Definición de terminado

**Packages:** las 40 filas aceptadas con evidencia (PR, migración, pruebas y ejemplo aprobado), D1–D8 resueltas, concurrencia comprobada en PostgreSQL real, integraciones de nómina, compras y CxP sin regresión, TSDoc completo y documentación vigente. **Web:** las 11 pantallas en producción tras el piloto, un único escritor de cuentas, las RPC legacy retiradas o envueltas, y balance de comprobación y estados financieros idénticos antes y después. Este plan describe ambos resultados y no afirma que ninguno esté construido.

## Orden de cierre (2026-10-26)

### Hallazgos de la revisión del 2026-10-26 (bloquean P2)

1. **El smoke PGlite sí se puede ejecutar.** `@electric-sql/pglite@0.5.8` está instalado en `node_modules` y `node supabase/checks/accounting-pglite.mjs` corre. Falla por errores reales de la migración, no por falta de dependencia.
2. **Error de sintaxis en `shared_accounting_execute_command` (línea 157 de la migración):** `if v_account.version<>case when … then … end or … then`. PL/pgSQL corta la condición del `IF` en el primer `THEN`, que en este caso pertenece al `CASE`. Corrección: envolver cada `CASE` de una condición `IF` entre paréntesis. Hay que revisar todos los `IF` con `CASE` en la migración.
3. **Expresión regular inválida en `accounting_code_position`:** `'^[A-Z0-9.\-/]{1,30}$'` produce un rango `\`–`/` inválido (`2201B invalid character range`). Corrección: `'^[A-Z0-9./-]{1,30}$'` (guion al final de la clase), o la clase que defina el ADR para los códigos.
4. Con las correcciones 2 y 3 aplicadas en una copia, la migración carga en PGlite. El resto del smoke no se ha validado.

### D9 — Reversas y cuentas inactivas (aceptada, 2026-10-26)

El disparador `shared_accounting_entry_lines_lock_account` rechaza siempre una cuenta **totalizadora**. Rechaza una cuenta **inactiva** solo cuando el asiento tiene `source = 'manual'`. Los asientos de integración (`payroll`, `inventory_purchase`, `payables_payment` y los futuros) ya validan que la cuenta esté activa en su propia RPC al publicar. Sus reversas reutilizan las cuentas del asiento original y deben poder ejecutarse aunque esa cuenta se haya inactivado después. Una prueba cubre este caso: publicar, inactivar la cuenta y reversar.

### Instrucción para el ejecutor: validar con el MCP de Supabase y cerrar el plan

**Reglas de uso del MCP de Supabase (proyecto de producción):**

- **Validar antes de aplicar.** Cada migración se ejecuta primero con `execute_sql` dentro de `begin; … rollback;`, seguida de las aserciones de su smoke en la misma transacción, contra el esquema real. Solo si todo pasa se aplica con `apply_migration`, con el mismo nombre de archivo y sin editar migraciones ya aplicadas. Después de aplicar, ejecutar `list_migrations` y `get_advisors` (security y performance) y corregir con una migración nueva todo hallazgo que introduzca este plan.
- **Primero el smoke local:** `node supabase/checks/accounting-pglite.mjs` en verde antes de tocar Supabase.
- **Regresión obligatoria tras cada migración aplicada:** los smokes `supabase/checks/native_payroll_accounting_posting_smoke.sql`, `native_purchase_accounting_posting_smoke.sql` y `native_accounting_rule_configuration_smoke.sql`, ejecutados en `begin; … rollback;`. Además, el balance de comprobación de las 6 empresas con cuentas debe ser idéntico antes y después: guardar el resultado previo en `docs/audit/`.
- **Datos reales (W3):** sin confirmación solo se aplican correcciones deterministas: crear y activar un plan para cada empresa que tenga uno solo, y asignar a ese plan las cuentas sin plan de `J506935210` y `J-40548909-0`. Los padres ausentes (6), los tipos distintos al del padre (4) y cualquier recodificación se presentan al usuario en un reporte y **no se aplican** hasta que el usuario los apruebe. Toda escritura de datos se hace mediante `shared_accounting_execute_command`, para que quede auditada; nunca con `UPDATE` directo.
- **Nunca** borrar filas, desactivar RLS ni conceder permisos a `anon`/`authenticated` sobre las RPC de comando.

**Orden de ejecución hasta cerrar el plan:** corregir los hallazgos 1–4 y D9 → smoke local → validar y aplicar P2 en Supabase → P3 ∥ P4 ∥ P5 (cada una con migración propia, el mismo ciclo de validación y su puerta de salida) → P6 → W1 → W2 (11 pantallas; `pnpm lint` y `pnpm build`) → W3 (correcciones deterministas + reporte) → T10 (documentación). Al terminar cada fase se actualiza "Seguimiento de ejecución" con la evidencia: comandos, resultados, nombre de la migración aplicada y salida de advisors.

**Elementos que requieren a una persona y no se pueden cerrar solo con código:**

- Plantilla VEN-NIF aprobada por el contador (puerta P1, CON-001 origen `template`).
- Aprobación de las correcciones de datos no deterministas de W3.
- Recorrido piloto en la Web con una empresa real.

Se entregan preparados (plantilla en borrador, reporte de W3 y guion del recorrido) y el plan queda en estado **"código completo; pendiente de aprobación contable y piloto"**, igual que el plan de CxP. No se declara cerrado algo que no tenga evidencia.

## Revisión independiente (2026-10-26, posterior a P2–P6, W1 y W3 parcial)

Verificado: `@kontave/accounting` `check` y 38/38 pruebas en verde; `accounting-pglite.mjs` en verde; las 8 migraciones aparecen en `list_migrations`; 5 planes `active`; las RPC de comando y consulta solo son ejecutables por `service_role`; los advisors no muestran hallazgos nuevos de contabilidad, salvo `rls_enabled_no_policy` (INFO, esperado para tablas exclusivas de `service_role`). Siguen sin plan las 13 cuentas de `J506935210` y las 3 de `J-40548909-0`.

Hallazgos que bloquean el cierre:

1. **Escritura directa que evita el escritor único (seguridad, preexistente desde la migración 131).** Las siete tablas legacy `shared_accounting_{charts,accounts,periods,entries,entry_lines,integration_rules,integration_log}` tienen la política `*_member_access` `FOR ALL TO authenticated`, condicionada solo a ser miembro aceptado del tenant, y `authenticated`/`anon` conservan `INSERT/UPDATE/DELETE`. Cualquier miembro, incluso de solo lectura, puede modificar o borrar cuentas, asientos contabilizados y reglas mediante PostgREST, sin permisos, versión ni auditoría. El código no usa acceso directo: todas las lecturas y escrituras pasan por RPC `SECURITY DEFINER` reservadas a `service_role`. Corrección: una migración nueva que revoque `INSERT, UPDATE, DELETE` a `anon` y `authenticated` en esas tablas y reemplace cada `FOR ALL` por una política `FOR SELECT` (o la elimine si ningún cliente lee directamente). Se valida en `begin/rollback`, se ejecutan los smokes de nómina, compras y CxP, y se comprueba con `get_advisors`.
2. **Las migraciones aplicadas no están versionadas en git.** Las 8 migraciones ya están en producción, pero el paquete, las migraciones, las rutas y las pantallas siguen sin commit. Hay que hacer el commit en una rama antes de continuar. Además, las versiones remotas (`20261026131735`…) no coinciden con los prefijos de los archivos (`20261026131735`…): se documenta la correspondencia en el README del paquete, o se renombran los archivos a la versión remota antes del commit, para que un `supabase db push` no intente aplicarlas de nuevo.
3. **Cuentas sueltas:** añadir el comando auditado `assign_account_to_chart`, que conserva el `id`, valida la estructura y el padre y rechaza si el plan destino no es de la misma empresa. Para `J506935210`, crear primero su plan con `create_chart` y activarlo; luego asignar las 13 cuentas. Para `J-40548909-0`, asignar las 3 al plan activo. Validar en `begin/rollback` y comparar el balance de comprobación antes y después.

### Evidencia posterior a la revisión independiente

- Commit inicial del trabajo contable: `74d8d067` en la rama `codex/accounting-chart-masters-closeout-2026-10-26`. Los 8 archivos de migración P2–P6 se renombraron con el prefijo `version` que devuelve Supabase, para que `supabase db push` no las intente repetir.
- La migración `20261026175448_accounting_legacy_write_lockdown.sql` fue validada en `begin/rollback` junto con `native_payroll_accounting_posting_smoke.sql`, `native_purchase_accounting_posting_smoke.sql` y `native_accounting_rule_configuration_smoke.sql`; luego se aplicó. `list_migrations` registra `20261026175448` (`accounting_legacy_write_lockdown`). La lectura sigue limitada a miembros aceptados y `authenticated` ya no tiene privilegios `INSERT`, `UPDATE` ni `DELETE` sobre las siete tablas.
- El advisor detectó que la política de lectura nueva evaluaba `auth.uid()` por fila; se corrigió con `20261026175733_accounting_legacy_read_policy_initplan.sql`, validada con los mismos tres smokes en `begin/rollback` y aplicada como versión `20261026175733`. Los avisos posteriores de seguridad son INFO preexistentes de tablas service-role-only; no hay avisos de seguridad contable nuevos. Rendimiento no reporta la evaluación por fila; mantiene avisos preexistentes de índices contables sin uso.
- Después del renombrado, `node supabase/checks/accounting-pglite.mjs` pasó. La fase de asignación W3 continúa pendiente: todavía no se creó el plan de `J506935210` ni se asignaron las 16 cuentas. No se modifican las seis referencias a padres ausentes ni los cuatro tipos incompatibles sin aprobación.

- **Seguridad legacy — aplicada:** ramas nuevas `20261026175448_accounting_legacy_write_lockdown.sql` y `20261026175733_accounting_legacy_read_policy_initplan.sql` coinciden con las versiones que informa Supabase. Ambas se probaron en `begin/rollback` con smokes de nómina, compras y configuración CxP; los advisors no reportan nuevos hallazgos de seguridad contable ni la advertencia de evaluación RLS por fila. Permanecen INFO preexistentes de RLS sin política para tablas solo `service_role` y avisos de índices contables sin uso.
- **W3 — correcciones deterministas aplicadas:** plan creado/activado en `J506935210`; 13 cuentas asignadas ahí y 3 a `J-40548909-0` mediante `assign_account_to_chart`, conservando IDs y balance. Seis padres ausentes y cuatro tipos incompatibles siguen intactos a la espera de aprobación; ver [cierre W3](../audit/accounting-w3-2026-10-26.md).
- **W2 — formularios implementados; piloto pendiente:** valores de atributos, activación de fuentes auxiliares, perfil contable y monedas tienen formularios de escritura. Build y lint pasan; ESLint reporta 328 warnings preexistentes.
- **W1 — implementado; HTTP pendiente:** rutas autenticadas y factory servidor. `corepack pnpm build` terminó correctamente; `corepack pnpm lint` terminó sin errores. La validación SQL de autorización delegada pasó con `service_role`; falta prueba HTTP de integración.
- **Pendiente humano:** aprobación contable de la plantilla VEN-NIF, aprobación de padres/tipos ambiguos y recorrido piloto. El estado global sigue siendo **código en cierre; pendiente de aprobación contable y piloto**, no cerrado.
