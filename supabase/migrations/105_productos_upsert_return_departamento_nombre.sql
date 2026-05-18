-- =============================================================================
-- 105_productos_upsert_return_departamento_nombre.sql
--
-- Hace que tenant_inventario_productos_upsert retorne `departamento_nombre`
-- (joineado contra inventario_departamentos), igual que ya lo hace
-- tenant_inventario_productos_get (mig 061).
--
-- Sin este cambio, después de crear/actualizar un producto el frontend recibe
-- el producto con `departamento_id` correcto pero `departamento_nombre = NULL`,
-- y la tabla de productos muestra "—" en la columna Departamento hasta que el
-- usuario refresca la página. Causa la falsa percepción de "el departamento no
-- se guardó" cuando el dato sí está en DB.
-- =============================================================================

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
        WITH upserted AS (
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
            RETURNING *
        )
        SELECT jsonb_build_object(
            'id',                  u.id,
            'empresa_id',          u.empresa_id,
            'departamento_id',     u.departamento_id,
            'departamento_nombre', d.nombre,
            'codigo',              u.codigo,
            'nombre',              u.nombre,
            'descripcion',         u.descripcion,
            'tipo',                u.tipo,
            'unidad_medida',       u.unidad_medida,
            'metodo_valuacion',    u.metodo_valuacion,
            'existencia_actual',   u.existencia_actual,
            'costo_promedio',      u.costo_promedio,
            'activo',              u.activo,
            'iva_tipo',            u.iva_tipo,
            'custom_fields',       u.custom_fields,
            'created_at',          u.created_at,
            'updated_at',          u.updated_at
        )
        FROM upserted u
        LEFT JOIN %I.inventario_departamentos d ON d.id = u.departamento_id
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
        p_row->'custom_fields',
        v_schema
    ) INTO v_result;

    RETURN v_result;
END;
$$;
