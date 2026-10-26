# Operación del módulo de contabilidad de planes y maestros

## Aplicación de esquema

Las migraciones de este incremento son aditivas y conservan `id` de cuentas: `20261026131735_accounting_chart_persistence`, `20261026131930_accounting_memorandum_counterpart_index`, `20261026132419_accounting_dimensions`, `20261026151445_accounting_dimension_foreign_key_indexes`, `20261026134135_accounting_auxiliaries`, `20261026135757_accounting_settings`, `20261026151732_accounting_routine_security` y `20261026152246_accounting_delegated_authorization`.

Para una migración futura:

1. Ejecutar `node supabase/checks/accounting-pglite.mjs`.
2. Leer el SQL y verificar el esquema afectado.
3. Validar con Supabase MCP `execute_sql` en `begin; ... rollback;`, incluyendo los tres smokes `native_payroll_accounting_posting_smoke.sql`, `native_purchase_accounting_posting_smoke.sql` y `native_accounting_rule_configuration_smoke.sql` dentro de la transacción.
4. Solo con esa transacción en verde, aplicar con `apply_migration` usando el nombre del archivo.
5. Confirmar `list_migrations`; correr los tres smokes nuevamente; revisar advisors de seguridad y rendimiento.
6. Comparar balances por empresa y período con el snapshot previo y guardar el nuevo snapshot en `docs/audit/`.

No editar migraciones registradas, usar SQL directo para cambios de datos, retirar RLS ni conceder RPC de comandos a roles cliente. Las cuentas se mutan vía `shared_accounting_execute_command`; comandos de consulta usan `shared_accounting_query`.

## Permisos y RPC

Las rutas Web autentican el bearer token, resuelven organización/empresa/tenant y comprueban el permiso canónico. El scope no se acepta desde el body. En membresía directa, el RPC verifica autorización con `assert_user_security_access`. Para una ruta delegada, la política de scope delegado se evalúa en servidor; `accounting_require_scope` acepta ese marcador solo si la llamada llega con el rol JWT `service_role` y valida organización, empresa y tenant.

Las RPC de comandos son solo para `service_role`. Los helpers de trigger y scope también están revocados para `anon` y `authenticated`. RLS sin policy en tablas de recibos, auditoría e historial es intencional mientras solo se lean/escriban mediante los RPC de servidor.

## Smokes actuales y límites

- PGlite: `node supabase/checks/accounting-pglite.mjs`.
- Regresión SQL: los tres smokes arriba; cada archivo administra rollback para no dejar filas de prueba.
- Build Web: `corepack pnpm build`.
- Lint y política de rutas: `corepack pnpm lint`.
- W3 actual: [reporte de datos](../audit/accounting-w3-2026-10-26.md) y [balance posterior](../audit/accounting-trial-balance-after-w3-2026-10-26.json).

El smoke de PGlite valida D9 y coexistencia con RPC legacy, dimensiones, auxiliares y configuración; no sustituye el recorrido de navegador ni demuestra autorización HTTP para usuarios delegados. El piloto manual sigue requerido: [guion](ACCOUNTING_PILOT.md).
