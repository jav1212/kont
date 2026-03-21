-- ---------------------------------------------------------------------------
-- 026 — Eliminar facturas confirmadas
-- ---------------------------------------------------------------------------
-- Agrega factura_compra_id a inventario_movimientos para vincular movimientos
-- de entrada_compra con su factura de origen.
-- Actualiza tenant_inventario_factura_confirmar para popularlo.
-- Actualiza tenant_inventario_factura_delete para revertir movimientos
-- al eliminar una factura confirmada.
-- ---------------------------------------------------------------------------

-- 1. Agregar columna factura_compra_id a todos los schemas existentes
DO $$
DECLARE r record; v_schema text;
BEGIN
    FOR r IN SELECT schema_name FROM public.tenants LOOP
        v_schema := r.schema_name;
        EXECUTE format(
            'ALTER TABLE %I.inventario_movimientos ADD COLUMN IF NOT EXISTS factura_compra_id text',
            v_schema
        );
    END LOOP;
END;
$$;

-- 2. Actualizar tenant_inventario_factura_confirmar para incluir factura_compra_id
CREATE OR REPLACE FUNCTION public.tenant_inventario_factura_confirmar(
    p_user_id    uuid,
    p_factura_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema         text;
    v_factura        record;
    v_item           record;
    v_existencia_act numeric(14,4);
    v_costo_prom     numeric(14,4);
    v_new_existencia numeric(14,4);
    v_new_costo_prom numeric(14,4);
    v_result         jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        'SELECT * FROM %I.inventario_facturas_compra WHERE id = %L',
        v_schema, p_factura_id
    ) INTO v_factura;

    IF v_factura IS NULL THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
    IF v_factura.estado = 'confirmada' THEN RAISE EXCEPTION 'La factura ya está confirmada'; END IF;

    EXECUTE format(
        'UPDATE %I.inventario_facturas_compra SET estado=''confirmada'', confirmada_at=now(), updated_at=now() WHERE id=%L',
        v_schema, p_factura_id
    );

    FOR v_item IN
        EXECUTE format(
            'SELECT * FROM %I.inventario_facturas_compra_items WHERE factura_id = %L',
            v_schema, p_factura_id
        )
    LOOP
        EXECUTE format(
            'SELECT existencia_actual, costo_promedio FROM %I.inventario_productos WHERE id = %L',
            v_schema, v_item.producto_id
        ) INTO v_existencia_act, v_costo_prom;

        v_new_existencia := v_existencia_act + v_item.cantidad;

        IF v_existencia_act > 0 THEN
            v_new_costo_prom := (v_existencia_act * v_costo_prom + v_item.cantidad * v_item.costo_unitario)
                                / v_new_existencia;
        ELSE
            v_new_costo_prom := v_item.costo_unitario;
        END IF;

        EXECUTE format(
            'UPDATE %I.inventario_productos SET existencia_actual=%L, costo_promedio=%L, updated_at=now() WHERE id=%L',
            v_schema, v_new_existencia, v_new_costo_prom, v_item.producto_id
        );

        EXECUTE format($sql$
            INSERT INTO %I.inventario_movimientos
                (id, empresa_id, producto_id, tipo, fecha, periodo,
                 cantidad, costo_unitario, costo_total, saldo_cantidad,
                 moneda, costo_moneda, tasa_dolar, referencia, notas, factura_compra_id)
            VALUES (
                gen_random_uuid()::text,
                %L, %L, 'entrada_compra', %L, %L,
                %L, %L, %L, %L,
                %L, %L, %L, %L, '', %L
            )
        $sql$,
            v_schema,
            v_factura.empresa_id, v_item.producto_id,
            v_factura.fecha, v_factura.periodo,
            v_item.cantidad, v_item.costo_unitario,
            v_item.cantidad * v_item.costo_unitario, v_new_existencia,
            v_item.moneda, v_item.costo_moneda, v_item.tasa_dolar,
            COALESCE(v_factura.numero_factura, ''),
            p_factura_id
        );
    END LOOP;

    EXECUTE format(
        'SELECT row_to_json(f)::jsonb FROM %I.inventario_facturas_compra f WHERE f.id = %L',
        v_schema, p_factura_id
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 3. Actualizar tenant_inventario_factura_delete para manejar facturas confirmadas
CREATE OR REPLACE FUNCTION public.tenant_inventario_factura_delete(
    p_user_id    uuid,
    p_factura_id text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema         text;
    v_factura        record;
    v_mov            record;
    v_existencia_act numeric(14,4);
    v_costo_prom     numeric(14,4);
    v_new_existencia numeric(14,4);
    v_new_costo_prom numeric(14,4);
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    EXECUTE format(
        'SELECT * FROM %I.inventario_facturas_compra WHERE id = %L',
        v_schema, p_factura_id
    ) INTO v_factura;

    IF v_factura IS NULL THEN
        RAISE EXCEPTION 'Factura no encontrada';
    END IF;

    -- Si está confirmada, revertir los movimientos de inventario
    IF v_factura.estado = 'confirmada' THEN
        FOR v_mov IN
            EXECUTE format(
                'SELECT * FROM %I.inventario_movimientos WHERE factura_compra_id = %L',
                v_schema, p_factura_id
            )
        LOOP
            -- Obtener existencia y costo actuales del producto
            EXECUTE format(
                'SELECT existencia_actual, costo_promedio FROM %I.inventario_productos WHERE id = %L',
                v_schema, v_mov.producto_id
            ) INTO v_existencia_act, v_costo_prom;

            v_new_existencia := v_existencia_act - v_mov.cantidad;

            -- Revertir costo promedio ponderado
            IF v_new_existencia > 0 THEN
                v_new_costo_prom := GREATEST(0,
                    (v_existencia_act * v_costo_prom - v_mov.cantidad * v_mov.costo_unitario)
                    / v_new_existencia
                );
            ELSE
                v_new_costo_prom := 0;
            END IF;

            EXECUTE format(
                'UPDATE %I.inventario_productos SET existencia_actual=%L, costo_promedio=%L, updated_at=now() WHERE id=%L',
                v_schema, v_new_existencia, v_new_costo_prom, v_mov.producto_id
            );
        END LOOP;

        -- Eliminar los movimientos vinculados
        EXECUTE format(
            'DELETE FROM %I.inventario_movimientos WHERE factura_compra_id = %L',
            v_schema, p_factura_id
        );
    END IF;

    -- Eliminar items y factura
    EXECUTE format(
        'DELETE FROM %I.inventario_facturas_compra_items WHERE factura_id = %L',
        v_schema, p_factura_id
    );

    EXECUTE format(
        'DELETE FROM %I.inventario_facturas_compra WHERE id = %L',
        v_schema, p_factura_id
    );
END;
$$;
