# `@kontave/accounting`

Núcleo portable para planes de cuentas y cuentas contables. Define el dominio, los comandos y consultas de aplicación, sus puertos de persistencia y autorización, y un adaptador en memoria disponible solo mediante `@kontave/accounting/testing`.

## Alcance actual

El paquete cubre los casos CON-001 a CON-017 del plan: planes en borrador, activos o archivados; estructura versionada de códigos; cuentas de detalle y totalizadoras; clasificación, naturaleza normal y clase monetaria; cuentas de orden emparejadas; activación, eliminación, recodificación y comprobación de referencias. Cada escritura lleva alcance de tenant y empresa, versión, correlación e idempotencia, y produce un hecho de auditoría que el adaptador durable debe confirmar junto con el recibo de idempotencia.

La creación admite un plan vacío, copia o importación `meister_txt`/CSV. La importación reconoce clasificaciones de raíz como ayuda para revisión, sin declarar una plantilla VEN-NIF aprobada. Un comando con origen `template` se rechaza explícitamente hasta que exista esa plantilla aprobada.

`recode_account` conserva el identificador y las referencias de movimientos, reubica el subárbol y registra los códigos anterior y nuevo. Una excepción a la naturaleza normal derivada requiere un motivo auditado. La inspección de estructura mantiene visibles las cuentas no conformes y enumera códigos, padres o tipos que deben corregirse antes de activar la estructura.

Las cuentas de orden de detalle requieren una pareja recíproca de naturaleza opuesta antes de activar el plan. `unpair_memorandum_accounts` elimina ambos enlaces con control de versión en planes borradores o archivados; una cuenta emparejada debe desvincularse antes de reclasificarla o convertirla en totalizadora.

## API pública

- `@kontave/accounting`: dominio y aplicación.
- `@kontave/accounting/domain`: modelos, invariantes y fallos esperados.
- `@kontave/accounting/application`: comandos, consultas, puertos, importación e inspección de estructura.
- `@kontave/accounting/testing`: repositorio y autorización en memoria para pruebas de consumidores. No proporciona persistencia de producción.

## Límites y siguientes puertas

No hay adaptador Supabase, migración, RPC, permisos instalados, integración Web ni modificación de datos reales. P2 debe implementar la persistencia atómica, el aislamiento tenant/empresa, la garantía SQL de un solo plan activo y las pruebas PostgreSQL. P3 a P5 incorporarán dimensiones, auxiliares y configuración; W1 a W3 conectarán el paquete, migrarán los datos y realizarán el piloto. Consulte el [ADR 0047](../../../docs/adr/0047-accounting-chart-and-masters.md) y el [plan de ejecución](../../../docs/project/PLAN_CONTABILIDAD_PLAN_DE_CUENTAS_Y_MAESTROS.md).

## Verificación

Las comprobaciones de tipos, 31/31 pruebas de comportamiento y la comprobación de arquitectura del workspace pasaron el 2026-10-23. Para repetirlas, ejecute:

```powershell
corepack pnpm --filter @kontave/accounting check
corepack pnpm --filter @kontave/accounting test
corepack pnpm --filter @kontave/architecture check
```

Una plantilla VEN-NIF aprobada sigue pendiente para cerrar la puerta P1.
