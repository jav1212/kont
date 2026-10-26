# ADR 0047: Plan de cuentas y maestros contables

- Estado: aceptado (D1–D8); T0 entregado y núcleo T1 implementado, pendiente de validación de su puerta
- Fecha: 2026-10-23
- Alcance de esta entrega: T0 y T1 del [plan de ejecución](../project/PLAN_CONTABILIDAD_PLAN_DE_CUENTAS_Y_MAESTROS.md)

## Contexto

La Web ya administra planes y cuentas en `shared_accounting_charts` y
`shared_accounting_accounts`. Asientos, reportes e integraciones de nómina,
compras y cuentas por pagar dependen de sus identificadores y de los cinco
valores existentes de `type`. La incorporación de estructura de códigos,
clasificación y maestros analíticos debe conservar esa compatibilidad.

Los conteos del plan son evidencia previa del 2026-10-23. La auditoría T0
debe distinguir esa evidencia de las consultas que efectivamente pueda volver
a ejecutar. El repositorio en memoria de T1 valida comportamiento portable;
no demuestra persistencia, aislamiento SQL ni concurrencia entre conexiones.

## Decisiones aceptadas

1. **D1: frontera.** Crear `@kontave/accounting` en
   `packages/business/accounting`, con dominio, aplicación, adaptadores y
   herramientas de prueba dentro del mismo workspace, según ADR 0035. Asientos
   y períodos podrán incorporarse después. `accounting-integration` conserva
   la traducción de hechos externos a asientos y puede consumir el dominio
   contable; contabilidad nunca depende de integración.
2. **D2: plan activo.** Una empresa tiene como máximo un plan `active`; los
   restantes son `draft` o `archived`. P2 debe garantizarlo mediante índice
   único parcial `(tenant_id, company_id) where status = 'active'`, además de
   las reglas del dominio. No hay backfill ni activación de datos en T1.
   W3 creará un plan para `J506935210` y asociará sus 13 cuentas sin plan,
   conservando identificadores, cuentas y movimientos.
3. **D3: clasificación compatible.** Mantener `asset`, `liability`, `equity`,
   `revenue` y `expense`; este último comprende costos y gastos. Las cuentas
   de orden se identifican mediante `is_memorandum` y naturaleza deudora o
   acreedora. Se excluyen de estados financieros cuando se integre el nuevo
   modelo con los reportes. No se incorpora un sexto tipo.
4. **D4: moneda.** La moneda funcional es VES y solo puede cambiarse sin
   asientos. Las monedas adicionales son de reporte y requieren tasa y fecha
   explícitas. Se reutilizan las definiciones y políticas de `monetary` y
   `companies`; contabilidad no crea otro catálogo de monedas o tasas.

## Diseño del núcleo

`ChartOfAccounts` posee estado, versión y estructura versionada del código.
`CodeStructure` define entre uno y nueve niveles, longitudes y separadores,
con longitud total máxima de 30 caracteres. El nivel y padre inmediato se
derivan del código. Cambiar la estructura requiere comprobar todas las
cuentas; no se reinterpretan silenciosamente datos existentes.

`LedgerAccount` conserva identidad, tipo y parentesco y distingue detalle de
totalizadora. Una totalizadora no recibe movimientos ni saldo propio. Convertir
detalle a totalizadora exige ausencia de líneas; convertir totalizadora a
detalle exige ausencia de hijos. Los movimientos bloquean cambios de
tipo y clase de cuenta. El código se corrige mediante `recode_account`, que conserva identidad y movimientos, reubica los descendientes y registra los códigos anterior y nuevo en auditoría. La eliminación también comprueba referencias de reglas
de integración, roles especiales y asociaciones. Activar un hijo requiere
padre activo; inactivar una totalizadora requiere hijos inactivos.

La aplicación define puertos para lectura y mutación atómica, alcance de
tenant y empresa, autorización, control de versión e idempotencia. Los fallos
esperados son tipados. El adaptador SQL futuro debe autorizar antes de
reproducir recibos, bloquear en orden determinista y confirmar mutación,
recibo y auditoría en una transacción. Un adaptador en memoria no sustituye
estas garantías de P2.

La persistencia futura amplía las tablas existentes y conserva la semántica
de `id`, `code`, `is_group` e `is_active`. W1 debe delegar las escrituras
legacy en el nuevo comando o retirarlas, para que exista un solo validador.
T1 no cambia rutas, consumidores ni funciones SQL de producción.

## Alcance entregado por T1 y límites

El workspace `@kontave/accounting` implementa el núcleo portable de los casos CON-001 a CON-017. Incluye comandos para crear, copiar e importar planes, administrar cuentas, recodificar subárboles, clasificar cuentas y emparejar cuentas de orden. Conserva el alcance tenant/empresa, el control de versión, la idempotencia, las referencias de eliminación y los hechos de auditoría como contratos de aplicación. La importación analiza exportaciones MEISTER/CSV sin presentar su clasificación inferida como plantilla VEN-NIF aprobada; el origen `template` se rechaza hasta que se instale una plantilla aprobada.

El repositorio y la autorización en memoria sirven para las 31 pruebas de comportamiento del paquete; las 31, la comprobación de tipos y la comprobación de arquitectura pasaron el 2026-10-23. No son evidencia de durabilidad, concurrencia, autorización instalada o aislamiento de PostgreSQL. Por ello T1 no cierra P1: una plantilla VEN-NIF aprobada sigue pendiente. P2 conserva la responsabilidad de los adaptadores Supabase, la migración, las garantías SQL y las pruebas de integración.

## Decisiones D5–D8 aceptadas

El usuario actualizó el plan el 2026-10-23 aceptando estas cuatro decisiones. Condicionan el núcleo, la configuración y la migración posteriores.

- **D5:** resolver tasas con el proveedor existente; si se requiere captura
  manual, implementarla en el dueño de tasas con fecha, fuente y trazabilidad.
- **D6:** numeración por empresa, tipo de comprobante y período; asignación
  definitiva al contabilizar (los borradores no consumen número), conservando números de
  comprobantes anulados sin reutilizarlos. El consumo de la secuencia pertenece al plan de asientos.
- **D7:** conservar lectura de cuentas no conformes y emitir un reporte;
  corregir antes de activar la estructura, preservando identidad y movimientos.
- **D8:** conservar `saldo_inicial` histórico como lectura y registrar nuevas
  aperturas mediante asientos. Conciliar los históricos antes de migrarlos para
  evitar doble contabilización.

## Consecuencias y puertas posteriores

Los maestros analíticos, auxiliares y configuración se incorporan en P3–P5.
Los terceros externos se consultan por puertos, sin duplicar sus maestros.
Los contratos de cliente y las pantallas se integran en P6 y W1–W2.

P2 debe demostrar persistencia y concurrencia PostgreSQL, tenant y empresa,
permisos, backfill compatible y regresión de integraciones. W3 requiere
conciliación y piloto con el usuario. Este ADR no declara esas fases ejecutadas
ni autoriza aplicar migraciones o modificar cuentas reales.

## Evidencia T0

La [auditoría del 2026-10-23](../audit/accounting-chart-t0-2026-10-23.json)
consultó Supabase mediante GET paginado de solo lectura: 5 planes, 2.129
cuentas, 4 asientos y 14 líneas. Hay 16 cuentas sin plan: 13 en `J506935210`
y 3 en `J-40548909-0`. Se detectaron seis referencias a padres inexistentes.
Los cinco planes presentan segmentos de longitudes `1.1.2.2.3`, sin códigos
fuera de esa máscara. Existen cuatro hijos de tipo diferente a su padre y
11 saldos iniciales no cero, todos en cuentas de detalle; ninguna totalizadora
tiene líneas. Las cuentas sueltas de `J506935210` incluyen dos líneas reales.
La asignación de las tres cuentas adicionales debe incorporarse al reporte
de no conformidad de W3, sin asignarlas automáticamente a un plan.

Las tablas privadas de publicaciones de nómina, compras y CxP respondieron
403 por PostgREST. Sus contratos se revisaron en las migraciones; esa revisión
no demuestra su contenido real. El reporte distingue las consultas observadas
de las comprobaciones SQL propuestas para P2.

Los permisos vigentes son `accounting.read/create/update/post/close`.
`accounting.chart.manage`, `accounting.masters.manage` y `accounting.configure`
requieren registro aditivo en persistencia e instalación, antes de exponer
los comandos nuevos.

`@kontave/operation-context` ya permite selección manual de tasa decimal con
razón auditada y `@kontave/monetary` representa `source.manual`. D5 requiere
consumir esa capacidad y verificar persistencia, fecha efectiva y trazabilidad
en su dueño al implementar P5.
