# Plan de cierre de Tesorería y entrega Web

Fecha: 2026-10-15. Estado: plan propuesto; revisión estática del árbol local.

Complementa [el plan de los 38 casos](PLAN_CAJA_BANCOS_TESORERIA.md) y el [ADR 0043](../adr/0043-company-treasury.md). La matriz empezó como revisión estática; el seguimiento actual incluye consultas MCP de solo lectura a Supabase, descritas abajo. TypeScript, ESLint y la prueba nueva no pudieron arrancar por permisos/ruta local de dependencias. La solicitud actual autoriza el corte explícito de Treasury hacia la Web productiva; no modifica el freeze de otros módulos.

## Diagnóstico

Existe una base portable considerable, persistencia SQL candidata, contratos remotos, endpoints y una pantalla Web parcial. No corresponde empezar de cero ni interpretar 38 pruebas como 38 requisitos aceptados. La matriz original combina clasificación inicial con avances posteriores y necesita una matriz de aceptación actualizada.

Fuentes inspeccionadas:

- `packages/business/treasury/src/application/{commands,queries,reporting}.ts`.
- `packages/business/treasury/src/domain/exchange-difference.ts`.
- `src/client-api/v1/treasury/execute-treasury-request.ts`.
- `app/(app)/treasury/page.tsx` y `app/(app)/settings/payment-orders/page.tsx`.
- `src/modules/organizations/frontend/module-access-policy.ts`, `src/shared/frontend/components/app-sidebar.tsx` y `src/modules/workspace/frontend/presentation-registry.ts`.
- `supabase/migrations/20261001200000_treasury_foundation.sql` y `20261002170000_treasury_module_catalog.sql`.

**Comprobación MCP remota 2026-10-15 (solo lectura):** `list_migrations` y consulta a `supabase_migrations.schema_migrations` sitúan la última migración en `20261014122140` (`iva_tax_rule_component_consistency`). `list_tables` y consulta de catálogo confirman cero tablas `public.shared_treasury_*`, cero permisos `treasury.*` y ninguna fila `module_catalog` con `code='treasury'`. Las dos migraciones Treasury candidatas del árbol local no aparecen en el historial remoto. Esto bloquea ejecutar la Web contra persistencia Treasury en ese proyecto y cualquier aceptación allí; no se aplicaron cambios remotos.

## Matriz de brechas

“Existe” significa que hay código local asociado; no acredita aceptación completa, despliegue ni cobertura de todas las excepciones.

| Casos | Base local | Web actual | Trabajo de cierre |
| --- | --- | --- | --- |
| TES-001–005, 027 | Maestros y consultas | Altas y listados | Detalles, filtros, paginación, datos protegidos y aceptación por empresa. |
| TES-006 | Cuenta en divisa y valoración | Alta de cuenta con moneda y movimientos; cobertura parcial | Restringir monedas a la política soportada, precisar decimales y comprobar tasas históricas y saldo nativo. |
| TES-007 | Saldo a fecha | Saldos del día | Selector de corte y reconstrucción comprobable. |
| TES-008–13 | Publicación, borradores y reverso | Borrador, publicación directa o publicación posterior, reverso con motivo | Aceptar estados/versiones y restricciones de cierre. Integración tributaria de TES-012 sigue separada. |
| TES-014–020 | Emisión, folios, entregas, lote e historial | Operación presente | Filtros completos de TES-016, paginación, evidencia de entrega, estados y aceptación de concurrencia/lotes. |
| TES-021–022 | Depósitos y reservas de cobranzas | Depósito caja→banco y selección de cobranzas | Aceptar flujo Sales→depósito, asignaciones parciales cuando corresponda, reversos y ausencia de doble cobro. |
| TES-023–025 | Crear/consultar/anular en payment-orders | Administración en Configuración; consulta/pago en Treasury | Integrar navegación y detalle en Tesorería, conservar endpoints y bloquear modificación/anulación de órdenes pagadas. |
| TES-026 | Liquidación única y consulta compuesta | Selección manual de beneficiario activo por ID y registro del ID en la ejecución | Confirmar historial, permisos cruzados y doble ejecución; el texto histórico de la orden se conserva como referencia. |
| TES-028–32 | Extractos, matching, reglas, preview, cierre e historial | Flujo Web local de importación, conciliación manual/automática, reglas, deshacer y cierre | Aceptar en staging importación idempotente, permisos, concurrencia, explicaciones de diferencias y cierre reproducible. |
| TES-033 | Cálculo/persistencia de diferencia separada | Contrato de comando/lectura; sin pantalla segura | Derivar snapshot desde el hecho origen, validar tasa/fuente y aprobar regla contable antes de ofrecer valoración. No publicar contabilidad automáticamente. |
| TES-034–035 | Política temporal y exclusiones | Pantalla Web de políticas versionadas y exclusiones con evidencia | Registrar fundamento y aprobación empresarial; aceptar vigencias, cálculo, compensación y permisos. |
| TES-036–037 | Libro filtrado con origen/responsable | Filtros parciales y primeras filas | Paginación real, filtro de estado, reversos visibles, totales por moneda y saldo reproducible. |
| TES-038 | Read model y renderers | CSV/PDF de siete familias | Validar contenido, totales, corte, permisos y límites. Ya existe exportación: no volver a implementarla desde cero. |

No se identificó una familia TES completamente ausente del catálogo portable. TES-028–032 ya tienen operación Web y esquema remoto. TES-034/035 cuentan con configuración y exclusión auditables en Web. TES-033 sigue sin flujo seguro de valoración porque necesita una tasa verificable y regla contable aprobada. Los 38 casos requieren evidencia de aceptación vigente.

### Baseline Web por caso

Estado del árbol local al iniciar la ejecución. “Parcial” significa que existe una parte visible/consumible en la Web, pero falta al menos un criterio, filtro, estado o aceptación del caso. La consulta de migraciones remotas sigue abierta.

| Caso | Estado Web inicial | Siguiente brecha observable |
| --- | --- | --- |
| TES-001 | Parcial | Validar alcance, duplicados y lista completa. |
| TES-002 | Parcial | Detalle, filtros, paginación y aislamiento por empresa. |
| TES-003 | Parcial | Validar unicidad y consulta completa. |
| TES-004 | Parcial | Revisar referencias de otra empresa y duplicados. |
| TES-005 | Parcial | Filtros/paginación; conservar enmascaramiento. |
| TES-006 | Parcial | Restringir divisas a política y aceptar valoración. |
| TES-007 | Parcial | Consultar y aceptar saldo a fecha. |
| TES-008–13 | Publicación, borradores y reverso | Borrador, publicación directa o publicación posterior, reverso con motivo | Aceptar estados/versiones y restricciones de cierre. Integración tributaria de TES-012 sigue separada. |
| TES-009 | Parcial | Flujo específico de ingreso y origen sin duplicación. |
| TES-010 | Parcial | Flujo específico de egreso, disponibilidad y concurrencia. |
| TES-011 | Parcial | Fecha valor y publicación atómica. |
| TES-012 | Parcial | Cargo tributario solo con política aprobada. |
| TES-013 | Parcial | Confirmar crédito único por origen. |
| TES-014 | Parcial | Aceptar folio, snapshot y débito único. |
| TES-015 | Parcial | Aceptar solapamiento/rango y moneda. |
| TES-016 | Parcial | Filtros por cuenta, folio, beneficiario, fecha y estado con paginación. |
| TES-017 | Parcial | Aceptar carrera por último folio y anulados. |
| TES-018 | Parcial | Evidencia, transición y versión. |
| TES-019 | Parcial | Historial, motivo y protección de cheque conciliado. |
| TES-020 | Parcial | Historial completo y aceptación de lotes. |
| TES-021 | Parcial | Aceptar origen/destino y reverso. |
| TES-022 | Parcial | Aceptar reserva concurrente Sales→depósito. |
| TES-023 | Parcial | Administración existente en Configuración; integrar acceso en módulo. |
| TES-024 | Parcial | Detalle y pagos asociados en la misma experiencia. |
| TES-025 | Parcial | Anulación clara y rechazo de orden ya ejecutada. |
| TES-026 | Parcial | Historial, permisos cruzados e idempotencia concurrente. |
| TES-027 | Parcial | Detalle, filtros y unicidad. |
| TES-028–32 | Extractos, matching, reglas, preview, cierre e historial | Flujo Web local de importación, conciliación manual/automática, reglas, deshacer y cierre | Aceptar en staging importación idempotente, permisos, concurrencia, explicaciones de diferencias y cierre reproducible. |
| TES-029 | Parcial | Flujo Web y RPC desplegados; aceptar ejecuciones con coincidencia única, ambigua y sin candidata. |
| TES-030 | Parcial | Flujo Web y RPC desplegados; aceptar versiones, vista previa y activación con roles autorizados/denegados. |
| TES-031 | Parcial | Flujo Web y RPC desplegados; aceptar historial, deshacer y bloqueo sobre extractos cerrados. |
| TES-032 | Parcial | Flujos Web y consultas desplegados; aceptar partidas de extracto/libro y cierre con diferencias explicadas. |
| TES-033 | Pendiente | Derivación segura desde origen, tasa verificable y regla contable aprobada. |
| TES-034 | Parcial | Pantalla y consultas de políticas desplegadas; falta aceptar vigencias y cálculo con aprobación empresarial. |
| TES-035 | Parcial | Pantalla de exclusión desplegada; falta aceptar permisos, evidencia e idempotencia del asiento compensatorio. |
| TES-036 | Parcial | Estado, paginación y totales por moneda. |
| TES-037 | Parcial | Estado, paginación y saldo reproducible con reversos. |
| TES-038 | Parcial | Aceptar siete reportes contra el read model y su corte. |

**F1-A implementado:** el despacho HTTP asigna `reconcile_manually` a `treasury.reconcile`; la resolución se extrajo a `treasury-command-permission.ts` y se agregó una prueba enfocada para conciliación manual, reversos y comandos no soportados. Falta ejecutar la prueba, validar autorizado/denegado en HTTP y permisos/RPC en PostgreSQL antes de cerrar F1.

**F2-R en curso:** la pantalla ya tiene selector de saldo a fecha, filtro por estado de movimiento, filtros de cuenta/folio/beneficiario/fecha/estado de cheque, estado visible en las filas, contadores basados en `total` del servidor para libro y cheques, resumen bajo demanda de totales por estado para cheques y movimientos, paginación del libro (50), cheques, entregas, depósitos, cobranzas elegibles y órdenes de pago (100), e historial de ejecuciones de pago con paginación (50) basado en el reporte autorizado `payments`. El historial usa el rango de fechas visible y muestra orden, pago, método, cuenta, monto y asiento. Los catálogos de cuentas, bancos, beneficiarios y chequeras se leen por páginas de 500, con límite explícito para evitar truncar silenciosamente catálogos muy grandes. Las cobranzas seleccionadas se conservan al navegar sus páginas y se limpian al cambiar destino o moneda. Se eligieron 100 cheques para mantener el límite de selección del lote existente. Sigue pendiente aceptación automática. TypeScript y ESLint no cargaron: `tsc` no está disponible mediante Corepack en el entorno actual; la prueba nueva tampoco arrancó porque Node no pudo resolver el paquete local `tsx`.

## Brechas técnicas concretas

1. **Corregido en F1-A:** `treasuryCommandPermission` asigna `treasury.reconcile` a `reconcile_manually`. Aun falta aceptacion HTTP/SQL con rol autorizado y denegacion sin permiso.
2. **Parcialmente corregido en F2-R:** el libro, cheques, entregas, depósitos, cobranzas elegibles, órdenes de pago e historial de ejecuciones tienen paginación visible; los catálogos se completan en páginas de 500 hasta 10.000 filas. Los totales por estado de cheque y movimientos se consultan bajo demanda. La aceptación completa aún requiere pruebas y evidencia de staging.
3. El servidor normaliza `money`, asignaciones y líneas de extracto, pero no las dos valoraciones de `record_foreign_exchange_difference`. Derivarlas desde evidencia confiable antes de habilitar TES-033.
4. Revisar el registro de presentación de Treasury y el significado del estado `planned` junto con sus consumidores; cambiarlo solo al satisfacer su contrato, sin usarlo como sustituto de permisos/entitlements.
5. **Comprobado por MCP el 2026-10-16:** el proyecto conectado registra las cuatro migraciones Treasury; hay 22 tablas con RLS, RPCs de comandos/consulta y catálogo Web activo. El esquema no sustituye la habilitación comercial por organizaci?n ni la aceptaci?n funcional.
6. El árbol tiene numerosos cambios locales, incluidos archivos de Treasury sin seguimiento Git. Definir un conjunto de entrega reproducible y separar cambios ajenos antes de preparar el despliegue.

## Diseño del módulo Web

Conservar `/treasury` como entrada y distribuir la presentación por capacidades:

| Ruta propuesta | Función |
| --- | --- |
| `/treasury` | Resumen, saldos y tareas pendientes. |
| `/treasury/accounts` | Cajas, bancos, cuentas, detalle y saldo a fecha. |
| `/treasury/movements` | Libro, borradores, publicación y reversos. |
| `/treasury/checks` | Chequeras, emisión, folios y entregas. |
| `/treasury/deposits` | Depósitos y cobranzas elegibles. |
| `/treasury/payment-orders` | Órdenes, anulación, liquidación e historial. |
| `/treasury/beneficiaries` | Beneficiarios y referencias bancarias protegidas. |
| `/treasury/reconciliation` | Importación, pendientes, vínculos, reglas, preview y cierre. |
| `/treasury/valuation` | Diferencias cambiarias y evidencia de valoración. |
| `/treasury/tax-policy` | Configuración tributaria y exclusiones auditables. |
| `/treasury/reports` | Reportes y exportaciones existentes. |

Las rutas son una propuesta de presentación, no módulos de negocio nuevos. Extraer hooks/componentes del archivo actual de forma incremental. Usar contratos tipados existentes y adaptadores Web para transporte; cálculos autoritativos permanecen en paquetes/servidor. Mantener compatibles las rutas actuales de órdenes mediante enlaces o redirecciones acordes a sus consumidores. El módulo instalable ya tiene catálogo y política de acceso: verificar su integración antes de añadir otra.

## Ejecución por entregables

| Fase | Entregable y alcance | Dependencia | Criterio de salida |
| --- | --- | --- | --- |
| F0 — Baseline | Matriz individual TES-001..038: contrato, código, Web, migración, prueba y aceptación. Inventario de escritores, datos, módulos y esquema remoto. | Ninguna | Cada caso tiene brecha verificable; empresa piloto, monedas, formatos de extracto y responsable funcional identificados. |
| F1 — Backend preparado | Corregir permiso manual; resolver valoración confiable, reglas faltantes y riesgos de comandos; revisar migraciones/dependencias y compatibilidad de órdenes/Sales. | F0 | Contratos completos para los cortes habilitados; autorización, idempotencia y persistencia verificadas en entorno aislado. |
| F2 — Módulo operativo | Navegación por capacidades, maestros/detalles, paginación, saldo a fecha, libro con borradores/reversos, cheques, depósitos, órdenes e informes. Reutilizar lo existente. | F1 para los comandos afectados | TES-001–027 y 036–038 tienen presentación y evidencia por criterio, exceptuando capacidades de divisas que aún estén bloqueadas. |
| F3 — Conciliación | CSV neutral con preview y errores por fila; importación idempotente, manual, automática, reglas versionadas, pendientes/historial, deshacer y cierre. | Libro/cheques/depósitos estables | TES-028–032 aceptados; extracto repetido inocuo, ambigüedad visible y cierre reproducible. |
| F4 — Divisas e impuestos | TES-006/033 con reglas contables; TES-034/035 con configuración aprobada, evidencia e interfaz. | Decisiones funcionales + F1 | Casos aprobados y pruebas de vigencia/valoración; ninguna tasa implícita ni cambio del saldo nativo por revaluación. |
| F5 — Staging y aceptación | Ensayo de migraciones, apertura e historia; flujos completos, permisos, concurrencia, exportaciones y recuperación. | F2–F4 para alcance completo | 38/38 aceptados para entrega completa; saldo por cuenta/moneda conciliado y plan de recuperación ensayado. |
| F6 — Piloto y ampliación | Despliegue controlado, activación por empresa, monitoreo y conciliación diaria inicial; ampliación posterior por cohortes. | F5 | Piloto aceptado, soporte y operación documentados, un escritor por hecho. |

F3 y F4 pueden desarrollarse independientemente cuando F1 estabilice contratos. Un único escritor por archivo/paquete. La coordinación integra backend y Web; documentación actualiza el alcance final estabilizado. No comprometer fechas antes del inventario F0.

Se puede acordar un piloto restringido con capacidades pendientes deshabilitadas y visibles en la matriz; eso no equivale a completar los 38 casos. La entrega integral exige F4 y aceptación total.

## Decisiones funcionales pendientes

- Empresa piloto, usuarios, separación de funciones y alcance de activación.
- Monedas iniciales soportadas, política de tasas exactas y precisión.
- Base de costo, eventos realizados y tratamiento contable de diferencias cambiarias.
- Extractos anonimizados de bancos objetivo y aceptación del matching inicial uno a uno.
- Fecha de corte, saldos documentados y tratamiento de cobranzas anteriores a apertura.
- Configuración tributaria aprobada por empresa y responsable de mantener su vigencia.
- Volumen, formatos y límites de reportes.

Conservar decisiones ya documentadas: bancos empresariales en el ADR 0043, sobregiro explícito, cheques emitidos con débito al emitir, entrega sin segundo débito, anulación de orden distinta de pago y primera liquidación total. No reabrirlas por estar aún enumeradas como preguntas en el plan antiguo.

## Validación prevista y puesta en producción

Esta planificación no ejecuta pruebas ni cambia comportamiento. Durante la implementación:

1. Ejecutar checks y pruebas de los paquetes afectados, contratos/adaptadores remotos y arquitectura; lint/build del Web.
2. Usar PGlite como comprobación rápida y PostgreSQL con conexiones independientes para carreras de saldo, folio, orden, reserva y conciliación. Revisar scripts antes de ejecutarlos y usar bases aisladas.
3. Probar autorización en HTTP y SQL, empresas ajenas, roles limitados, acceso delegado, versiones, timeout después del commit y reintentos.
4. Aceptar escenarios Sales→cobro→depósito→extracto→conciliación→reporte y orden→pago/cheque→entrega→conciliación. Aceptar borrador→publicación→reverso y valoración/impuesto según configuración.
5. Ensayar datos en staging, comparar saldos y reportes con baseline y preparar respaldo/recuperación. Las aperturas no vuelven a registrar cobranzas ya incluidas.
6. Preparar artefacto, migraciones, evidencia y alcance concretos antes de la aprobación final de despliegue. Activar catálogo/entitlement y permisos de la empresa piloto de manera deliberada.
7. Ante incidentes, suspender nuevos comandos y conservar lecturas/auditoría. No borrar hechos ni volver a un escritor que desconozca operaciones nuevas; reparar o compensar mediante procedimiento probado.

F0 tiene una matriz por caso y comprobación MCP. Las migraciones Treasury y las consultas tributarias est?n aplicadas en el proyecto remoto. F1-A está implementado en el despacho HTTP; el chequeo TypeScript del paquete y global, las 43 pruebas del paquete y el build Web pasaron el 2026-10-16. F2-R/F3 y la configuraci?n fiscal tienen pantallas y persistencia remota; su aceptaci?n funcional integral contin?a pendiente.

## Avance F3 — conciliación Web

Se agregó `/treasury/reconciliation` y un acceso desde la entrada de Tesorería. La primera entrega incluye lectura paginada de partidas e historial, plantilla CSV, vista previa con validaciones por fila, restricción de tamaño/cantidad y comando idempotente de importación protegido por `treasury.reconcile`. Las fechas del CSV se validan como fechas calendario reales y las reglas de período/moneda se recalculan al cambiar los controles.

F3 permanece sin aceptación: falta desplegar el esquema en staging y ejecutar el flujo con permisos reales. La pantalla ya expone importación, acciones manuales y automáticas, reglas, deshacer y cierre. Las lecturas aditivas entregan versiones de línea/libro, identidad/versión del extracto y catálogo de reglas; la aceptación sigue pendiente.

Validación MCP de solo lectura del 2026-10-15: última migración `20261014122140`, cero tablas `shared_treasury_*` y cero filas de módulo `treasury`. El entorno remoto consultado no permite validar consultas ni importación de Tesorería todavía. TypeScript/lint siguen dependiendo de restaurar las dependencias locales.

## Avance F3 — deshacer vínculos y bloqueo de reglas

El historial permite deshacer cada vinculo activo con un motivo y su version esperada; el permiso Web es `treasury.reverse`. El despacho HTTP de `configure_reconciliation` y `activate_reconciliation_rule` ahora usa `treasury.manage`, alineado con la autorizacion SQL.

Se corrigio el contrato para que la tolerancia sea nativa (`amount` + `currency`) y no exija una valoracion operativa que el algoritmo no usa. La configuracion, preview persistido, activacion explicita y ejecucion automatica ya estan conectados para la sesion Web actual; las coincidencias ambiguas se mantienen pendientes. La regla se crea con un nuevo identificador, asi que el catalogo de versiones existentes aun requiere una lectura paginada antes de ofrecer administracion completa tras recarga.

La versión de la fundación SQL con la nueva validación está local y pendiente de despliegue junto con el resto de Treasury. MCP sigue mostrando cero tablas y módulo en el proyecto conectado, por lo que aún no se puede ejecutar ni aceptar este flujo allí.

## Avance F3 — conciliación manual

La pantalla ahora consulta candidatos pendientes de extracto y libro con paginación independiente (500 por página), versión, dirección, importe y moneda. Permite elegir pares compatibles, exigir motivo y enviar `reconcile_manually` con ambas versiones observadas e idempotencia; PostgreSQL conserva la validación autoritativa de cuenta, estado, importe y concurrencia. El read model se actualiza mediante la migración aditiva `20261015143000_treasury_reconciliation_read_versions.sql`.

La comprobación del 2026-10-15 era previa al despliegue. El esquema quedó aplicado el 2026-10-16; pendiente aceptación HTTP/SQL con roles permitidos y denegados, importación idempotente, deshacer y cierre reproducible.

## Avance F3 — catálogo de reglas automáticas

La lectura de conciliación ahora incluye un catálogo paginado de versiones por cuenta bancaria. La pantalla permite recuperar reglas tras recargar, distinguir borradores y activas, generar vistas previas solo para borradores y ejecutar una regla activa seleccionada indicando fecha de corte. Cambiar de cuenta limpia la selección para impedir reutilizar una regla de otra cuenta. El contrato de lectura y la migración aditiva `20261015143000_treasury_reconciliation_read_versions.sql` incorporan esta consulta.

La implementación queda pendiente de compilación local y validación contra PostgreSQL integrado; el entorno MCP conectado aún no tiene el esquema Treasury y no permite validar el query remoto. La siguiente secuencia es restaurar dependencias, ejecutar checks proporcionales y preparar staging con las migraciones antes de aceptar F3.

## Avance F3 — cierre de extractos

Se agrego una consulta paginada de extractos abiertos por cuenta que devuelve periodo, referencia, estado y version. La pantalla permite seleccionar un extracto, proporcionar la explicacion de diferencias cuando corresponda y enviar `close_reconciliation` con su version observada. PostgreSQL conserva la validacion de diferencias pendientes, bloqueo por estado y concurrencia optimista; el cambio es local y aditivo en la migracion de lectura Treasury.

Pendiente de aceptación: probar cierre sin diferencias y con diferencias explicadas/no explicadas, rechazo por versión obsoleta y bloqueo de nuevos vínculos/deshacer sobre extractos cerrados.

## Avance F2 — ciclo de movimientos

El formulario de movimientos ahora permite guardar un borrador o publicarlo directamente. Los borradores se pueden publicar con la versión observada del movimiento y de la cuenta; los movimientos publicados se pueden reversar con motivo y fecha del día. La consulta entrega la versión del movimiento, y el permiso HTTP de crear borradores se alineó con `treasury.post`. Al reversar, PostgreSQL también incrementa la versión de la cuenta para invalidar snapshots anteriores.

La validación automática local sigue bloqueada por EPERM al leer TypeScript desde node_modules; PGlite tampoco inicia porque falta el paquete en su ruta temporal. MCP confirma esquema remoto instalado el 2026-10-16. El siguiente bloque es aceptar TES-008–13 y TES-028–035 con concurrencia, conciliación y política empresarial vigente.
## Avance TES-026 — identidad del beneficiario

La liquidación ya exige escoger manualmente un beneficiario activo del catálogo Treasury; no preselecciona ni filtra por coincidencia textual. La API valida el ID dentro de la empresa y estado activo, y persiste ese ID en la ejecución. Se conserva el texto administrativo de las órdenes existentes. El fixture PGlite usa deliberadamente un texto distinto para comprobar el flujo basado en identidad.

Pendiente: ejecutar la prueba PGlite disponible y aceptar en staging con órdenes heredadas, beneficiario inactivo/de otra empresa y doble ejecución.

## Estado de implementación y esquema remoto — 2026-10-16

El proyecto Supabase conectado registra, en orden, `treasury_foundation` (`20261016125851`), `treasury_module_catalog` (`20261016125904`), `treasury_reconciliation_read_versions` (`20261016130007`) y `treasury_tax_policy_reads` (`20261016131120`). MCP confirma 22 tablas `shared_treasury_*` con RLS habilitado, RPCs de comandos/consulta y el módulo `treasury` activo para Web. Las tablas están vacías; las consultas tributarias se ejecutaron con el contexto de una empresa autorizada y devolvieron cero filas sin error.

La Web incluye dashboard e informes, conciliación bancaria y la pantalla `/treasury/tax-policy` para versiones de política y exclusiones auditables. Las lecturas tributarias y la migración nueva quedaron conectadas. La instalación/entitlement se asigna por organización y no se habilitó masivamente. TES-033 sigue pendiente hasta definir una fuente verificable de tasa y una regla contable aprobada.

Validación local del 2026-10-16: check TypeScript del paquete Treasury y TypeScript global pasaron; 43 pruebas del paquete pasaron; `pnpm build` completó compilación, TypeScript y generación de 287 páginas, incluidas `/treasury`, `/treasury/reconciliation` y `/treasury/tax-policy`. PGlite sigue sin ejecutarse porque falta el paquete en la ruta temporal configurada.

El código aún no está publicado en Vercel. MCP identifica como producción actual el commit `5aa730a`; la rama local `master` tiene 2 commits propios y está 16 commits detrás de `origin/master`. El workspace contiene muchos otros cambios sin integrar. Publicar desde este estado podría excluir cambios necesarios o mezclar trabajo ajeno; preparar una rama de liberación basada en el remoto y validar su artefacto antes de promoverla es el paso pendiente.
