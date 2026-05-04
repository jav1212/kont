-- =============================================================================
-- 089_inventory_factura_migrate_periodo.sql
-- Adds an optional p_periodo_destino (YYYY-MM) parameter to
-- public.tenant_inventario_factura_migrate so the operator can collapse the
-- whole batch into a different accounting period in the destination company.
--
-- Behaviour when p_periodo_destino is provided:
--   - El check de período cerrado en destino usa el período override
--     (no el período original de la factura).
--   - El UPDATE de cabecera setea `periodo = override` y `periodo_manual = true`
--     para que un futuro re-edit no vuelva a derivar período desde fecha.
--   - El re-confirmar (cuando estaba confirmada) genera movimientos con el
--     nuevo período en destino — `tenant_inventario_factura_confirmar` lee
--     `f.periodo` desde la cabecera, así que el orden update→confirmar es OK.
--
-- Cuando p_periodo_destino es NULL o vacío, se conserva el período original
-- (comportamiento previo de la 088).
-- =============================================================================

DROP FUNCTION IF EXISTS public.tenant_inventario_factura_migrate(uuid, text[], text);

CREATE OR REPLACE FUNCTION public.tenant_inventario_factura_migrate(
    p_user_id            uuid,
    p_factura_ids        text[],
    p_empresa_destino_id text,
    p_periodo_destino    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schema            text;
    v_factura_id        text;
    v_factura           record;
    v_source_empresa_id text;
    v_was_confirmed     boolean;
    v_target_empresa_exists boolean;
    v_period_closed     boolean;
    v_target_periodo    text;
    v_override_periodo  boolean;

    v_supplier_map      jsonb := '{}'::jsonb;
    v_product_map       jsonb := '{}'::jsonb;

    v_target_supplier_id text;
    v_supplier_row       record;

    v_item               record;
    v_target_product_id  text;
    v_product_row        record;

    v_post_factura       record;

    v_migrated          jsonb := '[]'::jsonb;
    v_skipped           jsonb := '[]'::jsonb;
    v_created_suppliers jsonb := '[]'::jsonb;
    v_created_products  jsonb := '[]'::jsonb;
BEGIN
    v_schema := public.tenant_get_schema(p_user_id);

    IF p_factura_ids IS NULL OR array_length(p_factura_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'No se proporcionaron facturas para migrar';
    END IF;

    IF p_empresa_destino_id IS NULL OR p_empresa_destino_id = '' THEN
        RAISE EXCEPTION 'La empresa destino es requerida';
    END IF;

    -- Normalizar override de período
    v_override_periodo := p_periodo_destino IS NOT NULL AND p_periodo_destino <> '';
    IF v_override_periodo THEN
        IF p_periodo_destino !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
            RAISE EXCEPTION 'El período destino "%" no tiene formato YYYY-MM', p_periodo_destino;
        END IF;
    END IF;

    -- Sanity: empresa destino debe existir en el tenant
    EXECUTE format(
        'SELECT EXISTS(SELECT 1 FROM %I.companies WHERE id = %L)',
        v_schema, p_empresa_destino_id
    ) INTO v_target_empresa_exists;

    IF NOT v_target_empresa_exists THEN
        RAISE EXCEPTION 'La empresa destino % no existe en el tenant', p_empresa_destino_id;
    END IF;

    FOREACH v_factura_id IN ARRAY p_factura_ids
    LOOP
        EXECUTE format(
            'SELECT * FROM %I.inventario_facturas_compra WHERE id = %L',
            v_schema, v_factura_id
        ) INTO v_factura;

        IF v_factura IS NULL THEN
            RAISE EXCEPTION 'Factura % no encontrada', v_factura_id;
        END IF;

        IF v_factura.empresa_id = p_empresa_destino_id THEN
            v_skipped := v_skipped || jsonb_build_object(
                'id',     v_factura_id,
                'reason', 'already-in-target'
            );
            CONTINUE;
        END IF;

        -- Período destino efectivo para esta factura
        IF v_override_periodo THEN
            v_target_periodo := p_periodo_destino;
        ELSE
            v_target_periodo := v_factura.periodo;
        END IF;

        -- Período cerrado en origen (usa período actual de la factura)
        EXECUTE format(
            'SELECT EXISTS(SELECT 1 FROM %I.inventario_cierres WHERE empresa_id = %L AND periodo = %L)',
            v_schema, v_factura.empresa_id, v_factura.periodo
        ) INTO v_period_closed;
        IF v_period_closed THEN
            RAISE EXCEPTION 'El período % de la factura % está cerrado en la empresa origen',
                v_factura.periodo, v_factura_id;
        END IF;

        -- Período cerrado en destino (usa período override si lo hay)
        EXECUTE format(
            'SELECT EXISTS(SELECT 1 FROM %I.inventario_cierres WHERE empresa_id = %L AND periodo = %L)',
            v_schema, p_empresa_destino_id, v_target_periodo
        ) INTO v_period_closed;
        IF v_period_closed THEN
            RAISE EXCEPTION 'El período % está cerrado en la empresa destino (factura %)',
                v_target_periodo, v_factura_id;
        END IF;

        v_source_empresa_id := v_factura.empresa_id;
        v_was_confirmed     := (v_factura.estado = 'confirmada');

        IF v_was_confirmed THEN
            PERFORM public.tenant_inventario_factura_desconfirmar(p_user_id, v_factura_id);
        END IF;

        -- ---- Resolver proveedor destino ------------------------------------
        IF v_supplier_map ? v_factura.proveedor_id THEN
            v_target_supplier_id := v_supplier_map->>v_factura.proveedor_id;
        ELSE
            v_target_supplier_id := NULL;

            EXECUTE format($q$
                WITH src AS (
                    SELECT rif, nombre FROM %I.inventario_proveedores WHERE id = %L
                )
                SELECT t.id
                FROM %I.inventario_proveedores t, src
                WHERE t.empresa_id = %L
                  AND (
                    (NULLIF(TRIM(src.rif), '') IS NOT NULL
                       AND lower(TRIM(t.rif)) = lower(TRIM(src.rif)))
                    OR
                    (NULLIF(TRIM(src.rif), '') IS NULL
                       AND lower(TRIM(t.nombre)) = lower(TRIM(src.nombre)))
                  )
                LIMIT 1
            $q$, v_schema, v_factura.proveedor_id, v_schema, p_empresa_destino_id)
            INTO v_target_supplier_id;

            IF v_target_supplier_id IS NULL THEN
                EXECUTE format($q$
                    INSERT INTO %I.inventario_proveedores
                        (id, empresa_id, rif, nombre, contacto, telefono, email,
                         direccion, notas, activo, created_at, updated_at)
                    SELECT
                        gen_random_uuid()::text, %L, rif, nombre, contacto,
                        telefono, email, direccion, notas, true, now(), now()
                    FROM %I.inventario_proveedores
                    WHERE id = %L
                    RETURNING id, rif, nombre
                $q$, v_schema, p_empresa_destino_id, v_schema, v_factura.proveedor_id)
                INTO v_supplier_row;

                v_target_supplier_id := v_supplier_row.id;

                v_created_suppliers := v_created_suppliers || jsonb_build_object(
                    'id',     v_supplier_row.id,
                    'rif',    v_supplier_row.rif,
                    'nombre', v_supplier_row.nombre
                );
            END IF;

            v_supplier_map := v_supplier_map
                              || jsonb_build_object(v_factura.proveedor_id, v_target_supplier_id);
        END IF;

        -- ---- Resolver cada producto del item -------------------------------
        FOR v_item IN
            EXECUTE format(
                'SELECT id, producto_id FROM %I.inventario_facturas_compra_items WHERE factura_id = %L',
                v_schema, v_factura_id
            )
        LOOP
            IF v_product_map ? v_item.producto_id THEN
                v_target_product_id := v_product_map->>v_item.producto_id;
            ELSE
                v_target_product_id := NULL;

                EXECUTE format($q$
                    WITH src AS (
                        SELECT codigo, nombre FROM %I.inventario_productos WHERE id = %L
                    )
                    SELECT t.id
                    FROM %I.inventario_productos t, src
                    WHERE t.empresa_id = %L
                      AND (
                        (NULLIF(TRIM(src.codigo), '') IS NOT NULL
                           AND lower(TRIM(t.codigo)) = lower(TRIM(src.codigo)))
                        OR
                        (NULLIF(TRIM(src.codigo), '') IS NULL
                           AND lower(TRIM(t.nombre)) = lower(TRIM(src.nombre)))
                      )
                    LIMIT 1
                $q$, v_schema, v_item.producto_id, v_schema, p_empresa_destino_id)
                INTO v_target_product_id;

                IF v_target_product_id IS NULL THEN
                    EXECUTE format($q$
                        INSERT INTO %I.inventario_productos
                            (id, empresa_id, codigo, nombre, descripcion, tipo,
                             unidad_medida, metodo_valuacion,
                             existencia_actual, costo_promedio, activo,
                             departamento_id, iva_tipo, custom_fields,
                             created_at, updated_at)
                        SELECT
                            gen_random_uuid()::text, %L, codigo, nombre, descripcion, tipo,
                            unidad_medida, metodo_valuacion,
                            0, 0, true,
                            NULL, iva_tipo, custom_fields,
                            now(), now()
                        FROM %I.inventario_productos
                        WHERE id = %L
                        RETURNING id, codigo, nombre
                    $q$, v_schema, p_empresa_destino_id, v_schema, v_item.producto_id)
                    INTO v_product_row;

                    v_target_product_id := v_product_row.id;

                    v_created_products := v_created_products || jsonb_build_object(
                        'id',     v_product_row.id,
                        'codigo', v_product_row.codigo,
                        'nombre', v_product_row.nombre
                    );
                END IF;

                v_product_map := v_product_map
                                 || jsonb_build_object(v_item.producto_id, v_target_product_id);
            END IF;

            EXECUTE format(
                'UPDATE %I.inventario_facturas_compra_items SET producto_id = %L WHERE id = %L',
                v_schema, v_target_product_id, v_item.id
            );
        END LOOP;

        -- ---- Mover la factura al destino -----------------------------------
        IF v_override_periodo THEN
            EXECUTE format($q$
                UPDATE %I.inventario_facturas_compra
                SET empresa_id     = %L,
                    proveedor_id   = %L,
                    periodo        = %L,
                    periodo_manual = true,
                    updated_at     = now()
                WHERE id = %L
            $q$, v_schema, p_empresa_destino_id, v_target_supplier_id, v_target_periodo, v_factura_id);
        ELSE
            EXECUTE format($q$
                UPDATE %I.inventario_facturas_compra
                SET empresa_id   = %L,
                    proveedor_id = %L,
                    updated_at   = now()
                WHERE id = %L
            $q$, v_schema, p_empresa_destino_id, v_target_supplier_id, v_factura_id);
        END IF;

        IF v_was_confirmed THEN
            PERFORM public.tenant_inventario_factura_confirmar(p_user_id, v_factura_id);
        END IF;

        EXECUTE format(
            'SELECT id, fecha, periodo, subtotal, iva_monto, total FROM %I.inventario_facturas_compra WHERE id = %L',
            v_schema, v_factura_id
        ) INTO v_post_factura;

        v_migrated := v_migrated || jsonb_build_object(
            'id',                v_factura_id,
            'source_empresa_id', v_source_empresa_id,
            'target_empresa_id', p_empresa_destino_id,
            'was_confirmed',     v_was_confirmed,
            'fecha',             v_post_factura.fecha,
            'periodo',           v_post_factura.periodo,
            'subtotal',          v_post_factura.subtotal,
            'iva_monto',         v_post_factura.iva_monto,
            'total',             v_post_factura.total
        );
    END LOOP;

    RETURN jsonb_build_object(
        'migrated',          v_migrated,
        'skipped',           v_skipped,
        'created_suppliers', v_created_suppliers,
        'created_products',  v_created_products
    );
END;
$$;
