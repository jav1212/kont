# @kontave/treasury

`@kontave/treasury` contiene el dominio, casos de uso y contratos portables de
Tesorería. La Web y los demás clientes consumen sus exports públicos; los
adaptadores de PostgreSQL y Supabase traducen esas operaciones a las RPC del
esquema operacional compartido.

## Lecturas y comandos SQL

Las lecturas pasan por `public.shared_treasury_query(jsonb, jsonb)`. La función
es `STABLE`: conserva un único snapshot MVCC para la página y su total, y
PostgREST puede ejecutarla dentro de una transacción de solo lectura. Su
autorización usa `public.assert_user_security_read_access`, que verifica actor,
organización, empresa y permiso sin bloquear filas.

Los comandos siguen pasando por
`public.shared_treasury_execute_command(jsonb, jsonb)`. Conservan el helper de
autorización con bloqueo porque toman decisiones de escritura y deben proteger
concurrencia, idempotencia y estado persistido.

La separación está definida en la migración
[`20261023080000_treasury_read_only_access_assertion.sql`](../../../supabase/migrations/20261023080000_treasury_read_only_access_assertion.sql).
Al añadir una consulta RPC `STABLE`, no se debe usar `FOR SHARE` ni `FOR UPDATE`,
de forma directa o a través de una función llamada. La regla general y su
racional están en el [estándar de arquitectura](../../../docs/standards/architecture.md#rpc-de-lectura-estable-y-bloqueos).

## API pública

El workspace expone el dominio y la aplicación desde `@kontave/treasury`, y
también los puntos de entrada `./domain`, `./application`, `./contracts`,
`./postgres`, `./supabase` y `./pdf`. Los consumidores deben importar solamente
estos exports declarados, de acuerdo con el
[estándar de arquitectura](../../../docs/standards/architecture.md#dependencias).

## Verificación focalizada

```bash
pnpm --filter @kontave/treasury check
pnpm --filter @kontave/treasury test
node scripts/test-treasury-postgres.mjs
```

La prueba PostgreSQL incluye una consulta en transacción de solo lectura para
proteger el contrato de `shared_treasury_query`.
