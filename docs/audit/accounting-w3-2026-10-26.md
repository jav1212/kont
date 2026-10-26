# Auditoría W3 de datos contables (2026-10-26)

Fuente: consultas de solo lectura mediante MCP de Supabase sobre `shared_accounting_charts` y `shared_accounting_accounts`, después de instalar P2–P5. Solo se modificaron los estados de los cinco planes únicos mediante comandos auditados; las cuentas no se tocaron.

## Inventario observado

| Empresa | Cuentas | Planes | Estado | Cuentas sin plan |
| --- | ---: | ---: | --- | ---: |
| J-30875696-2 | 453 | 1 | active | 0 |
| J-30910209-5 | 453 | 1 | active | 0 |
| J-3122611-0 | 375 | 1 | active | 0 |
| J-40548909-0 | 460 | 1 | active | 3 |
| J-40721349-0 | 375 | 1 | active | 0 |
| J506935210 | 13 | 0 | — | 13 |

Se activaron los cinco planes únicos con `shared_accounting_execute_command` (`activate_chart`, versiones esperadas 1→2), después de validar las cinco llamadas dentro de `begin/rollback`. La consulta posterior confirma estado activo. Los balances de comprobación de las cuatro empresas con períodos siguen idénticos al baseline: [antes](accounting-trial-balance-before-2026-10-26.json) y [después](accounting-trial-balance-after-w3-2026-10-26.json). Dos de las seis empresas con cuentas no tienen períodos contables. `J506935210` no tiene plan de destino, por lo que sus 13 cuentas no se asignaron ni se creó un plan implícito. En `J-40548909-0`, las tres cuentas sueltas tampoco se asignaron: falta un comando auditado del paquete para conservar su ID al moverlas de plan.

## Referencias a padres ausentes

Se comparó el padre dentro de la misma empresa y del mismo `chart_id` (incluido `NULL`):

- `J-40548909-0`, plan `NULL`: `1.1.01.03.001` Banco Fondo Comun, `1.1.01.03.002` Banco B y `1.1.01.03.003` Banco C referencian `1.1.01.03`.
- `J506935210`, plan `NULL`: `3.1.01` Capital Social referencia `3.1`; `4.1.01` Ventas referencia `4.1`; `5.1.01` Costo de Ventas referencia `5.1`.

Son seis casos y requieren aprobación/reparación de estructura; no se cambiaron.

## Tipos inconsistentes con el padre

En `J-40548909-0`, los siguientes hijos son `liability` pero su padre `3.1.01.01` tiene un tipo distinto:

- `3.1.01.01.001` Fondo de Reserva Legal 15%.
- `3.1.01.01.002` Diferencial Cambiario.
- `3.1.01.01.003` Fondo Arrendamiento.
- `3.1.01.01.004` Fondo Mejora Edificio 10%.

No se alteraron tipos ni se recodificaron cuentas.

## Siguiente paso W3

El producto carece aún de un comando de paquete persistente para asignar cuentas existentes sin plan a un plan, conservando su `id` y registrando auditoría. No se debe simular la asignación con `UPDATE` ni reutilizar una importación que inserta IDs duplicados. Añadir y probar el comando explícito, validar su impacto en PGlite y contra Supabase en `begin/rollback`, ejecutar los smokes obligatorios y volver a tomar el balance antes de considerar las 16 cuentas sin plan.

Pendiente de aprobación humana: resolver los seis padres ausentes, los cuatro tipos incompatibles y cualquier recodificación; realizar recorrido piloto y confirmar activaciones de planes borrador.
