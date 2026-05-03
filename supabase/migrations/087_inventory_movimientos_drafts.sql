-- =============================================================================
-- 087_inventory_movimientos_drafts.sql
--
-- Adds draft persistence for manual inventory movements (manual entries,
-- adjustments, returns, self-consumption). The `inventario_movimientos` table
-- is left untouched so existing kardex / books / reports keep working with
-- zero risk of regression. Drafts live in a separate per-tenant table:
-- `inventario_movimientos_drafts`. When a draft group is confirmed, each row
-- is fed through the existing `tenant_inventario_movimientos_save` function
-- (which handles COGS for outbound types and updates `inventario_productos`)
-- and the draft rows are deleted.
--
-- New tables (per tenant schema):
--   inventario_movimientos_drafts
--
-- New RPCs:
--   tenant_inventario_movimientos_draft_save
--   tenant_inventario_movimientos_draft_confirmar_grupo
--   tenant_inventario_movimientos_draft_listar_ultimo
--   tenant_inventario_movimientos_draft_get_grupo
--   tenant_inventario_movimientos_draft_descartar
--
-- Provisioning: `provision_tenant_schema` is extended so new tenants get the
-- table on creation.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Helper — DDL applied to a single tenant schema
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._inv_drafts_install(v_schema text, p_user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.inventario_movimientos_drafts (
            id                text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            draft_group_id    uuid        NOT NULL,
            empresa_id        text        NOT NULL REFERENCES %I.companies(id) ON DELETE CASCADE,
            producto_id       text        NOT NULL REFERENCES %I.inventario_productos(id) ON DELETE CASCADE,
            tipo              text        NOT NULL,
            fecha             date        NOT NULL DEFAULT CURRENT_DATE,
            cantidad          numeric(14,4) NOT NULL DEFAULT 0,
            costo_unitario    numeric(14,4) NOT NULL DEFAULT 0,
            moneda            text        NOT NULL DEFAULT 'B',
            costo_moneda      numeric(14,4),
            tasa_dolar        numeric(14,4),
            referencia        text        NOT NULL DEFAULT '',
            notas             text        NOT NULL DEFAULT '',
            descuento_tipo    text,
            descuento_valor   numeric(14,4) NOT NULL DEFAULT 0,
            descuento_monto   numeric(14,2) NOT NULL DEFAULT 0,
            recargo_tipo      text,
            recargo_valor     numeric(14,4) NOT NULL DEFAULT 0,
            recargo_monto     numeric(14,2) NOT NULL DEFAULT 0,
            base_iva          numeric(14,2),
            precio_venta_unitario numeric(14,4),
            -- form metadata so the UI can restore the right page state
            kind              text        NOT NULL DEFAULT 'entrada',
            direction         text        NOT NULL DEFAULT 'inbound',
            iva_mode          text        NOT NULL DEFAULT 'agregado',
            context           jsonb       NOT NULL DEFAULT '{}'::jsonb,
            created_at        timestamptz NOT NULL DEFAULT now(),
            updated_at        timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_movs_drafts_group_idx ON %I.inventario_movimientos_drafts(empresa_id, kind, draft_group_id)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS inv_movs_drafts_recent_idx ON %I.inventario_movimientos_drafts(empresa_id, kind, updated_at DESC)', v_schema);

    EXECUTE format('ALTER TABLE %I.inventario_movimientos_drafts ENABLE ROW LEVEL SECURITY', v_schema);

    EXECUTE format($pol$
        DO $do$ BEGIN
            CREATE POLICY tenant_owner ON %I.inventario_movimientos_drafts FOR ALL USING (auth.uid() = %L::uuid);
        EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
    $pol$, v_schema, p_user_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Provision new tenants with the drafts table
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_tenant_drafts_table(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema text;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    PERFORM public._inv_drafts_install(v_schema, p_user_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Backfill existing tenant schemas
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN SELECT id, schema_name FROM public.tenants LOOP
        PERFORM public._inv_drafts_install(r.schema_name, r.id);
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. RPC: draft_save
--    UPSERT semantics — replaces the entire group. The frontend always sends
--    the full set of items, so wholesale replace keeps the function simple
--    and side-effect free (no orphan rows when the user removes a line).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_movimientos_draft_save(
    p_user_id        uuid,
    p_empresa_id     text,
    p_draft_group_id uuid,
    p_kind           text,
    p_direction      text,
    p_iva_mode       text,
    p_context        jsonb,
    p_movements      jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema   text;
    v_group    uuid;
    v_count    int := 0;
    v_now      timestamptz := now();
    v_row      jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    v_group  := COALESCE(p_draft_group_id, gen_random_uuid());

    -- Replace strategy: delete existing rows in the group, then insert anew.
    EXECUTE format(
        'DELETE FROM %I.inventario_movimientos_drafts WHERE empresa_id = %L AND draft_group_id = %L',
        v_schema, p_empresa_id, v_group
    );

    FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(p_movements, '[]'::jsonb)) LOOP
        EXECUTE format($sql$
            INSERT INTO %I.inventario_movimientos_drafts
                (id, draft_group_id, empresa_id, producto_id,
                 tipo, fecha, cantidad, costo_unitario,
                 moneda, costo_moneda, tasa_dolar,
                 referencia, notas,
                 descuento_tipo, descuento_valor, descuento_monto,
                 recargo_tipo, recargo_valor, recargo_monto,
                 base_iva, precio_venta_unitario,
                 kind, direction, iva_mode, context,
                 created_at, updated_at)
            VALUES (
                COALESCE(NULLIF(%L,''), gen_random_uuid()::text),
                %L::uuid, %L, %L,
                %L, COALESCE(NULLIF(%L,''), CURRENT_DATE::text)::date,
                COALESCE(NULLIF(%L,'')::numeric, 0),
                COALESCE(NULLIF(%L,'')::numeric, 0),
                COALESCE(NULLIF(%L,''), 'B'),
                NULLIF(%L,'')::numeric, NULLIF(%L,'')::numeric,
                COALESCE(%L,''), COALESCE(%L,''),
                NULLIF(%L,''),
                COALESCE(NULLIF(%L,'')::numeric, 0), COALESCE(NULLIF(%L,'')::numeric, 0),
                NULLIF(%L,''),
                COALESCE(NULLIF(%L,'')::numeric, 0), COALESCE(NULLIF(%L,'')::numeric, 0),
                NULLIF(%L,'')::numeric, NULLIF(%L,'')::numeric,
                COALESCE(NULLIF(%L,''), 'entrada'),
                COALESCE(NULLIF(%L,''), 'inbound'),
                COALESCE(NULLIF(%L,''), 'agregado'),
                COALESCE(%L::jsonb, '{}'::jsonb),
                %L, %L
            )
        $sql$,
            v_schema,
            v_row->>'id',
            v_group, p_empresa_id, v_row->>'productoId',
            v_row->>'tipo', v_row->>'fecha',
            v_row->>'cantidad',
            v_row->>'costoUnitario',
            v_row->>'moneda',
            v_row->>'costoMoneda', v_row->>'tasaDolar',
            v_row->>'referencia', v_row->>'notas',
            v_row->>'descuentoTipo', v_row->>'descuentoValor', v_row->>'descuentoMonto',
            v_row->>'recargoTipo',   v_row->>'recargoValor',   v_row->>'recargoMonto',
            v_row->>'baseIva', v_row->>'precioVentaUnitario',
            p_kind, p_direction, p_iva_mode, p_context::text,
            v_now, v_now
        );
        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'draftGroupId', v_group,
        'count',        v_count,
        'updatedAt',    v_now
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. RPC: draft_confirmar_grupo
--    Promotes every row in the draft group to a confirmed movement by
--    invoking the existing tenant_inventario_movimientos_save function so
--    COGS / costo_promedio / existencia_actual stay in sync. After all rows
--    are saved, the draft group is deleted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_movimientos_draft_confirmar_grupo(
    p_user_id        uuid,
    p_empresa_id     text,
    p_draft_group_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema       text;
    v_drafts       jsonb;
    v_row          jsonb;
    v_save_input   jsonb;
    v_count        int := 0;
    v_confirmed_ids text[] := ARRAY[]::text[];
    v_save_result  jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    -- Load the drafts in deterministic order (insertion order) so that
    -- multi-line edits get persisted in the same sequence the user saw.
    EXECUTE format(
        'SELECT COALESCE(jsonb_agg(d ORDER BY d.created_at, d.id), ''[]''::jsonb)
           FROM %I.inventario_movimientos_drafts d
          WHERE d.empresa_id = %L AND d.draft_group_id = %L::uuid',
        v_schema, p_empresa_id, p_draft_group_id
    ) INTO v_drafts;

    IF v_drafts IS NULL OR jsonb_array_length(v_drafts) = 0 THEN
        RAISE EXCEPTION 'Draft group not found or empty: %', p_draft_group_id;
    END IF;

    FOR v_row IN SELECT * FROM jsonb_array_elements(v_drafts) LOOP
        -- Adapt draft row → save_movements input shape.
        v_save_input := jsonb_build_object(
            'empresa_id',      p_empresa_id,
            'producto_id',     v_row->>'producto_id',
            'tipo',            v_row->>'tipo',
            'fecha',           v_row->>'fecha',
            'cantidad',        v_row->>'cantidad',
            'costo_unitario',  v_row->>'costo_unitario',
            'moneda',          v_row->>'moneda',
            'costo_moneda',    v_row->>'costo_moneda',
            'tasa_dolar',      v_row->>'tasa_dolar',
            'referencia',      v_row->>'referencia',
            'notas',           v_row->>'notas',
            'descuento_tipo',  v_row->>'descuento_tipo',
            'descuento_valor', v_row->>'descuento_valor',
            'descuento_monto', v_row->>'descuento_monto',
            'recargo_tipo',    v_row->>'recargo_tipo',
            'recargo_valor',   v_row->>'recargo_valor',
            'recargo_monto',   v_row->>'recargo_monto',
            'base_iva',        v_row->>'base_iva',
            'precio_venta_unitario', v_row->>'precio_venta_unitario'
        );

        SELECT public.tenant_inventario_movimientos_save(p_user_id, v_save_input)
          INTO v_save_result;

        v_confirmed_ids := v_confirmed_ids || (v_save_result->>'id');
        v_count := v_count + 1;
    END LOOP;

    -- All rows confirmed — wipe the draft group.
    EXECUTE format(
        'DELETE FROM %I.inventario_movimientos_drafts
          WHERE empresa_id = %L AND draft_group_id = %L::uuid',
        v_schema, p_empresa_id, p_draft_group_id
    );

    RETURN jsonb_build_object(
        'count',        v_count,
        'confirmedIds', to_jsonb(v_confirmed_ids)
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. RPC: draft_listar_ultimo
--    Returns the most-recently updated draft group for the company + kind,
--    or NULL if none exists.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_movimientos_draft_listar_ultimo(
    p_user_id    uuid,
    p_empresa_id text,
    p_kind       text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema text;
    v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format($q$
        SELECT jsonb_build_object(
            'draftGroupId', d.draft_group_id,
            'kind',         MAX(d.kind),
            'direction',    MAX(d.direction),
            'ivaMode',      MAX(d.iva_mode),
            'context',      MAX(d.context),
            'count',        COUNT(*),
            'totalCantidad', SUM(d.cantidad),
            'updatedAt',    MAX(d.updated_at)
        )
          FROM %I.inventario_movimientos_drafts d
         WHERE d.empresa_id = %L
           AND d.kind = %L
         GROUP BY d.draft_group_id
         ORDER BY MAX(d.updated_at) DESC
         LIMIT 1
    $q$, v_schema, p_empresa_id, p_kind) INTO v_result;

    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. RPC: draft_get_grupo
--    Returns the full draft group (meta + items) so the UI can rehydrate.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_movimientos_draft_get_grupo(
    p_user_id        uuid,
    p_empresa_id     text,
    p_draft_group_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema text;
    v_meta   jsonb;
    v_items  jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format($q$
        SELECT jsonb_build_object(
            'draftGroupId', d.draft_group_id,
            'kind',         MAX(d.kind),
            'direction',    MAX(d.direction),
            'ivaMode',      MAX(d.iva_mode),
            'context',      MAX(d.context),
            'fecha',        MAX(d.fecha),
            'updatedAt',    MAX(d.updated_at)
        )
          FROM %I.inventario_movimientos_drafts d
         WHERE d.empresa_id = %L AND d.draft_group_id = %L::uuid
         GROUP BY d.draft_group_id
    $q$, v_schema, p_empresa_id, p_draft_group_id) INTO v_meta;

    IF v_meta IS NULL THEN
        RETURN NULL;
    END IF;

    EXECUTE format($q$
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id',              d.id,
            'productoId',      d.producto_id,
            'tipo',            d.tipo,
            'fecha',           d.fecha,
            'cantidad',        d.cantidad,
            'costoUnitario',   d.costo_unitario,
            'moneda',          d.moneda,
            'costoMoneda',     d.costo_moneda,
            'tasaDolar',       d.tasa_dolar,
            'referencia',      d.referencia,
            'notas',           d.notas,
            'descuentoTipo',   d.descuento_tipo,
            'descuentoValor',  d.descuento_valor,
            'descuentoMonto',  d.descuento_monto,
            'recargoTipo',     d.recargo_tipo,
            'recargoValor',    d.recargo_valor,
            'recargoMonto',    d.recargo_monto,
            'baseIva',         d.base_iva,
            'precioVentaUnitario', d.precio_venta_unitario
        ) ORDER BY d.created_at, d.id), '[]'::jsonb)
          FROM %I.inventario_movimientos_drafts d
         WHERE d.empresa_id = %L AND d.draft_group_id = %L::uuid
    $q$, v_schema, p_empresa_id, p_draft_group_id) INTO v_items;

    RETURN jsonb_build_object('meta', v_meta, 'items', v_items);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. RPC: draft_descartar
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_movimientos_draft_descartar(
    p_user_id        uuid,
    p_empresa_id     text,
    p_draft_group_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema text;
    v_count  int;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        'WITH del AS (
             DELETE FROM %I.inventario_movimientos_drafts
              WHERE empresa_id = %L AND draft_group_id = %L::uuid
              RETURNING 1
         ) SELECT COUNT(*) FROM del',
        v_schema, p_empresa_id, p_draft_group_id
    ) INTO v_count;

    RETURN jsonb_build_object('deleted', v_count);
END;
$$;
