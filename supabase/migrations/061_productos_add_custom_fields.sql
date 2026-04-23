-- =============================================================================
-- 060_productos_add_custom_fields.sql
-- Adds custom_fields JSONB column to inventario_productos for sector-specific
-- and user-defined extra data per product.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Backfill — add custom_fields to all existing tenant schemas
-- ---------------------------------------------------------------------------
DO $$
DECLARE rec RECORD;
BEGIN
    FOR rec IN SELECT schema_name FROM public.tenants LOOP
        EXECUTE format(
            'ALTER TABLE %I.inventario_productos
             ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT ''{}''::jsonb',
            rec.schema_name
        );
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Update tenant_inventario_productos_get to include custom_fields
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_productos_get(
    p_user_id    uuid,
    p_empresa_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema text;
    v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    EXECUTE format(
        $sql$
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id',                  p.id,
                    'empresa_id',          p.empresa_id,
                    'departamento_id',     p.departamento_id,
                    'departamento_nombre', d.nombre,
                    'codigo',              p.codigo,
                    'nombre',              p.nombre,
                    'descripcion',         p.descripcion,
                    'tipo',                p.tipo,
                    'unidad_medida',       p.unidad_medida,
                    'metodo_valuacion',    p.metodo_valuacion,
                    'existencia_actual',   p.existencia_actual,
                    'costo_promedio',      p.costo_promedio,
                    'activo',              p.activo,
                    'iva_tipo',            p.iva_tipo,
                    'custom_fields',       p.custom_fields,
                    'created_at',          p.created_at,
                    'updated_at',          p.updated_at
                )
                ORDER BY p.nombre
            ),
            '[]'::jsonb
        )
        FROM %I.inventario_productos p
        LEFT JOIN %I.inventario_departamentos d ON d.id = p.departamento_id
        WHERE p.empresa_id = %L
        $sql$,
        v_schema, v_schema, p_empresa_id
    ) INTO v_result;
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Update tenant_inventario_productos_upsert to include custom_fields
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_inventario_productos_upsert(
    p_user_id uuid,
    p_row     jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema text;
    v_id     text;
    v_result jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);
    v_id := COALESCE(NULLIF(p_row->>'id', ''), gen_random_uuid()::text);

    EXECUTE format($sql$
        INSERT INTO %I.inventario_productos
            (id, empresa_id, departamento_id, codigo, nombre, descripcion, tipo, unidad_medida,
             metodo_valuacion, existencia_actual, costo_promedio,
             activo, iva_tipo, custom_fields, updated_at)
        VALUES (
            %L, %L,
            NULLIF(%L, ''),
            COALESCE(%L, ''),
            %L,
            COALESCE(%L, ''),
            COALESCE(%L, 'mercancia'),
            COALESCE(%L, 'unidad'),
            COALESCE(%L, 'promedio_ponderado'),
            COALESCE((%L)::numeric, 0),
            COALESCE((%L)::numeric, 0),
            COALESCE((%L)::boolean, true),
            COALESCE(NULLIF(%L,''), 'general'),
            COALESCE((%L)::jsonb, '{}'::jsonb),
            now()
        )
        ON CONFLICT (id) DO UPDATE SET
            departamento_id  = EXCLUDED.departamento_id,
            codigo           = EXCLUDED.codigo,
            nombre           = EXCLUDED.nombre,
            descripcion      = EXCLUDED.descripcion,
            tipo             = EXCLUDED.tipo,
            unidad_medida    = EXCLUDED.unidad_medida,
            metodo_valuacion = EXCLUDED.metodo_valuacion,
            activo           = EXCLUDED.activo,
            iva_tipo         = EXCLUDED.iva_tipo,
            custom_fields    = EXCLUDED.custom_fields,
            updated_at       = now()
        RETURNING row_to_json(inventario_productos)
    $sql$,
        v_schema, v_id,
        p_row->>'empresa_id',
        p_row->>'departamento_id',
        p_row->>'codigo',
        p_row->>'nombre',
        p_row->>'descripcion',
        p_row->>'tipo',
        p_row->>'unidad_medida',
        p_row->>'metodo_valuacion',
        p_row->>'existencia_actual',
        p_row->>'costo_promedio',
        p_row->>'activo',
        p_row->>'iva_tipo',
        p_row->'custom_fields'
    ) INTO v_result;

    RETURN v_result;
END;
$$;
