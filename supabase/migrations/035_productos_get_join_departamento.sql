-- Migration 035: Fix tenant_inventario_productos_get to JOIN inventario_departamentos
-- The original RPC (013) used plain row_to_json(p) with no JOIN, so departamento_nombre
-- was never returned to the frontend even when departamento_id was correctly stored.

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
                    'moneda_defecto',      p.moneda_defecto,
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
