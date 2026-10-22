# `@kontave/payroll`

Reglas de cálculo y flujos portables de nómina. El dominio y la aplicación no dependen de Supabase; los adaptadores de `./src/adapters/supabase` se usan sólo desde composición de servidor con credenciales de servicio.

## Consolidación de recibos por sucursal

[`AssignPayrollRunReceiptBranches`](./src/application/payroll-branch-consolidation.ts) asigna una sucursal a cada recibo de una corrida nueva elegible. El comando exige un conjunto completo de asignaciones, una única sucursal por recibo y entre uno y 500 recibos. La operación es atómica: una vez que la corrida tiene recibos atribuidos, sus instantáneas y la atribución no se pueden modificar. Un reintento del mismo actor con el mismo contenido se reproduce de forma idempotente.

[`GetPayrollBranchConsolidation`](./src/application/payroll-branch-consolidation.ts) consulta recibos confirmados en un período civil de hasta 366 días, opcionalmente filtrado a 100 sucursales. Devuelve por sucursal únicamente conteos y totales funcionales exactos en VES de ganancias, deducciones, bonos y pago neto; no devuelve información personal de empleados. La cobertura comunica los recibos atribuidos y, sólo cuando el actor tiene acceso al ámbito completo, el total histórico sin sucursal.

[`SupabasePayrollRunReceiptBranchAssignmentPort`](./src/adapters/supabase/payroll-branch-consolidation.ts) y [`SupabasePayrollBranchConsolidationReader`](./src/adapters/supabase/payroll-branch-consolidation.ts) llaman únicamente a las RPC protegidas `assign_native_payroll_run_receipt_branches` y `get_native_payroll_branch_consolidation`. El contrato está en [`352_payroll_receipt_branch_consolidation.sql`](../../../supabase/migrations/352_payroll_receipt_branch_consolidation.sql). Las RPC son exclusivas de `service_role`; validan `payroll.confirm` y `branches.select` para asignar, y `payroll.read` y `branches.consolidate` para consultar.

La migración conserva las corridas y recibos históricos sin inferir una sucursal. Una corrida nueva puede atribuir sus recibos a distintas sucursales, pero un recibo sólo puede tener una y no se puede dividir su importe. El cliente Web actual todavía guarda corridas y recibos por el flujo heredado sin atribución; debe conectarse a este contrato antes de presentar la consolidación al usuario.
