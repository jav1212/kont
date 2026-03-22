-- Fix: row_to_json(%I.inventario_movimientos) generates schema.table as a correlation name
-- which PostgreSQL can't resolve in a RETURNING clause. Use unqualified table name instead.
CREATE OR REPLACE FUNCTION public.tenant_inventario_movimientos_save(
    p_user_id uuid,
    p_row     jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema         text;
    v_id             text;
    v_fecha          date;
    v_periodo        text;
    v_producto_id    text;
    v_empresa_id     text;
    v_tipo           text;
    v_cantidad       numeric(14,4);
    v_costo_unit     numeric(14,4);
    v_costo_total    numeric(14,2);
    v_saldo_cant     numeric(14,4);
    v_saldo_valor    numeric(14,2);
    v_prev_cant      numeric(14,4);
    v_prev_costo     numeric(14,4);
    v_new_costo_unit numeric(14,4);
    v_tipos_salida   text[] := ARRAY['salida','salida_produccion','ajuste_negativo',
                                     'devolucion_entrada','autoconsumo'];
    v_result         jsonb;
BEGIN
    v_schema      := public.tenant_get_schema(p_user_id);
    v_id          := COALESCE(NULLIF(p_row->>'id',''), gen_random_uuid()::text);
    v_fecha       := COALESCE(NULLIF(p_row->>'fecha',''), CURRENT_DATE::text)::date;
    v_periodo     := COALESCE(NULLIF(p_row->>'periodo',''), to_char(v_fecha,'YYYY-MM'));
    v_producto_id := p_row->>'producto_id';
    v_empresa_id  := p_row->>'empresa_id';
    v_tipo        := p_row->>'tipo';
    v_cantidad    := (p_row->>'cantidad')::numeric;
    v_costo_unit  := COALESCE(NULLIF(p_row->>'costo_unitario',''), '0')::numeric;
    v_costo_total := ROUND(v_cantidad * v_costo_unit, 2);

    EXECUTE format(
        'SELECT existencia_actual, costo_promedio FROM %I.inventario_productos WHERE id = %L',
        v_schema, v_producto_id
    ) INTO v_prev_cant, v_prev_costo;

    IF v_tipo = ANY(v_tipos_salida) THEN
        v_saldo_cant  := GREATEST(0, COALESCE(v_prev_cant, 0) - v_cantidad);
        v_saldo_valor := ROUND(v_saldo_cant * COALESCE(v_prev_costo, 0), 2);
        v_new_costo_unit := v_prev_costo;
    ELSE
        v_saldo_cant := COALESCE(v_prev_cant, 0) + v_cantidad;
        IF v_saldo_cant > 0 THEN
            v_new_costo_unit := ROUND(
                (COALESCE(v_prev_cant, 0) * COALESCE(v_prev_costo, 0) + v_costo_total) / v_saldo_cant,
                4
            );
        ELSE
            v_new_costo_unit := v_costo_unit;
        END IF;
        v_saldo_valor := ROUND(v_saldo_cant * v_new_costo_unit, 2);
    END IF;

    EXECUTE format($sql$
        INSERT INTO %I.inventario_movimientos (
            id, empresa_id, producto_id, transformacion_id, tipo,
            fecha, periodo, cantidad, costo_unitario, costo_total,
            saldo_cantidad, saldo_valor, referencia, notas,
            moneda, costo_moneda, tasa_dolar
        ) VALUES (
            %L, %L, %L, %L, %L,
            %L, %L, %L, %L, %L,
            %L, %L, %L, %L,
            %L, %L, %L
        )
        ON CONFLICT (id) DO UPDATE SET
            tipo           = EXCLUDED.tipo,
            fecha          = EXCLUDED.fecha,
            periodo        = EXCLUDED.periodo,
            cantidad       = EXCLUDED.cantidad,
            costo_unitario = EXCLUDED.costo_unitario,
            costo_total    = EXCLUDED.costo_total,
            saldo_cantidad = EXCLUDED.saldo_cantidad,
            saldo_valor    = EXCLUDED.saldo_valor,
            referencia     = EXCLUDED.referencia,
            notas          = EXCLUDED.notas,
            moneda         = EXCLUDED.moneda,
            costo_moneda   = EXCLUDED.costo_moneda,
            tasa_dolar     = EXCLUDED.tasa_dolar
        RETURNING row_to_json(inventario_movimientos)::jsonb
    $sql$,
        v_schema,
        v_id, v_empresa_id, v_producto_id,
        NULLIF(p_row->>'transformacion_id', ''),
        v_tipo,
        v_fecha, v_periodo, v_cantidad, v_costo_unit, v_costo_total,
        v_saldo_cant, v_saldo_valor,
        COALESCE(p_row->>'referencia', ''),
        COALESCE(p_row->>'notas', ''),
        COALESCE(NULLIF(p_row->>'moneda', ''), 'B'),
        CASE WHEN p_row->>'costo_moneda' IS NOT NULL AND p_row->>'costo_moneda' != ''
             THEN (p_row->>'costo_moneda')::numeric ELSE NULL END,
        CASE WHEN p_row->>'tasa_dolar' IS NOT NULL AND p_row->>'tasa_dolar' != ''
             THEN (p_row->>'tasa_dolar')::numeric ELSE NULL END
    ) INTO v_result;

    IF v_tipo = ANY(v_tipos_salida) THEN
        EXECUTE format(
            'UPDATE %I.inventario_productos SET existencia_actual = %L, updated_at = now() WHERE id = %L',
            v_schema, v_saldo_cant, v_producto_id
        );
    ELSE
        EXECUTE format(
            'UPDATE %I.inventario_productos SET existencia_actual = %L, costo_promedio = %L, updated_at = now() WHERE id = %L',
            v_schema, v_saldo_cant, v_new_costo_unit, v_producto_id
        );
    END IF;

    RETURN v_result;
END;
$$;
