-- =============================================================================
-- 071_inventory_drop_kardex_and_production.sql
--
-- Cleanup for the pilot-customer scope:
--
--  1. Drops the standalone kardex RPC (`tenant_inventario_kardex`). The kardex
--     report page and use case have been removed from the app. The period-level
--     kardex RPC (`tenant_inventario_kardex_periodo`) is kept because the ISLR
--     report still depends on it.
--
--  2. Removes the production / transformations feature entirely:
--      - drops the per-tenant `inventario_transformaciones` and
--        `inventario_transformaciones_insumos` tables (CASCADE → also removes
--        FK references and the `transformacion_id` column on
--        `inventario_movimientos`).
--      - drops `tenant_inventario_transformacion_save` and
--        `tenant_inventario_transformaciones_get`.
--      - rewrites `inventario_movimientos.tipo` CHECK to remove the
--        `entrada_produccion` and `salida_produccion` values, mapping any
--        legacy rows that still hold those values to plain `entrada` / `salida`.
--
--  3. Reduces `inventario_productos.tipo` to a single value (`mercancia`).
--     Any legacy rows of type `materia_prima` or `producto_terminado` are
--     migrated to `mercancia`.
-- =============================================================================

DO $$
DECLARE
    r        record;
    v_schema text;
BEGIN
    -- ---------------------------------------------------------------------
    -- Per-tenant cleanup (tables, columns, CHECK constraints, data fixes)
    -- ---------------------------------------------------------------------
    FOR r IN SELECT schema_name FROM public.tenants LOOP
        v_schema := r.schema_name;

        -- 1. Map legacy production movement types to plain entrada/salida so
        --    the new CHECK passes. Rows with these tipos are rare (production
        --    was barely used in the pilot) but we preserve the inventory math
        --    rather than delete them.
        EXECUTE format(
            'UPDATE %I.inventario_movimientos SET tipo = ''entrada'' WHERE tipo = ''entrada_produccion''',
            v_schema
        );
        EXECUTE format(
            'UPDATE %I.inventario_movimientos SET tipo = ''salida'' WHERE tipo = ''salida_produccion''',
            v_schema
        );

        -- 2. Drop production tables (CASCADE removes the FK + transformacion_id
        --    column on inventario_movimientos). IF EXISTS so the migration is
        --    idempotent.
        EXECUTE format('DROP TABLE IF EXISTS %I.inventario_transformaciones_insumos CASCADE', v_schema);
        EXECUTE format('DROP TABLE IF EXISTS %I.inventario_transformaciones        CASCADE', v_schema);

        -- 3. Belt-and-suspenders: if CASCADE didn't strip the column (e.g. the
        --    table never existed in this tenant), drop it explicitly.
        EXECUTE format(
            'ALTER TABLE %I.inventario_movimientos DROP COLUMN IF EXISTS transformacion_id',
            v_schema
        );

        -- 4. Rewrite movimientos.tipo CHECK without production types.
        EXECUTE format(
            'ALTER TABLE %I.inventario_movimientos DROP CONSTRAINT IF EXISTS inventario_movimientos_tipo_check',
            v_schema
        );
        EXECUTE format($s$
            ALTER TABLE %I.inventario_movimientos
                ADD CONSTRAINT inventario_movimientos_tipo_check
                CHECK (tipo IN (
                    'entrada','salida',
                    'ajuste_positivo','ajuste_negativo',
                    'devolucion_entrada','devolucion_salida',
                    'autoconsumo'
                ))
        $s$, v_schema);

        -- 5. Collapse productos.tipo to 'mercancia' only.
        EXECUTE format(
            $s$UPDATE %I.inventario_productos SET tipo = 'mercancia' WHERE tipo IN ('materia_prima','producto_terminado')$s$,
            v_schema
        );
        EXECUTE format(
            'ALTER TABLE %I.inventario_productos DROP CONSTRAINT IF EXISTS inventario_productos_tipo_check',
            v_schema
        );
        EXECUTE format($s$
            ALTER TABLE %I.inventario_productos
                ADD CONSTRAINT inventario_productos_tipo_check
                CHECK (tipo = 'mercancia')
        $s$, v_schema);
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Drop the global RPCs that no longer have callers in the app.
-- (kardex_periodo intentionally NOT dropped — used by the ISLR report.)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tenant_inventario_kardex(uuid, text, text);
DROP FUNCTION IF EXISTS public.tenant_inventario_transformacion_save(uuid, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.tenant_inventario_transformaciones_get(uuid, text);
