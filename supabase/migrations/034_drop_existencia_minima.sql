-- Migration 034: Remove existencia_minima from inventario_productos
-- The field is no longer used in the UI, CSV, or domain model.

-- 1. Drop the column from all tenant schemas
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT schema_name
        FROM information_schema.schemata
        WHERE schema_name LIKE 'tenant_%'
    LOOP
        EXECUTE format(
            'ALTER TABLE %I.inventario_productos DROP COLUMN IF EXISTS existencia_minima',
            r.schema_name
        );
    END LOOP;
END;
$$;

-- 2. Replace the upsert RPC (remove existencia_minima, keep departamento_id/iva_tipo/moneda_defecto)
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
             activo, iva_tipo, moneda_defecto, updated_at)
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
            COALESCE(NULLIF(%L,''), 'B'),
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
            moneda_defecto   = EXCLUDED.moneda_defecto,
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
        p_row->>'moneda_defecto'
    ) INTO v_result;

    RETURN v_result;
END;
$$;
