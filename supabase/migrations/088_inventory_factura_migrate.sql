-- =============================================================================
-- 088_inventory_factura_migrate.sql
-- Adds public.tenant_inventario_factura_migrate(p_user_id, p_factura_ids,
-- p_empresa_destino_id) to migrate purchase invoices (and their items, plus
-- the underlying movements when they were already confirmed) from one company
-- to another inside the same tenant schema.
--
-- Behaviour per invoice:
--   1. If empresa_id == destino → registered as skipped, continue.
--   2. If período cerrado en origen o en destino → RAISE EXCEPTION (todo el
--      lote se revierte, ninguna factura queda a medio mover).
--   3. Si la factura está confirmada → PERFORM tenant_inventario_factura_desconfirmar
--      (revierte movimientos, recompone existencia y costo_promedio en origen).
--   4. Resolver proveedor destino: lookup por RIF (case-insensitive trim);
--      si el RIF está vacío, lookup por nombre. Si no existe, clonar.
--   5. Para cada item, resolver producto destino: lookup por codigo (si el
--      codigo origen no es vacío); fallback por nombre. Si no existe, clonar
--      con existencia_actual=0 y costo_promedio=0 (la confirmación posterior
--      recalculará el costo promedio en destino con esta compra como input).
--   6. UPDATE empresa_id + proveedor_id en el header.
--   7. UPDATE producto_id en cada item.
--   8. Si la factura estaba confirmada en origen → PERFORM
--      tenant_inventario_factura_confirmar (genera movimientos en destino
--      contra el costo promedio actual del destino).
--
-- Devuelve un jsonb con migrated[], skipped[], created_suppliers[] y
-- created_products[]. La capa API itera `migrated` y dispara la integración
-- contable (reverse en origen + process en destino) para las facturas que
-- estaban confirmadas — la RPC sólo hace inventario, no contabilidad.
--
-- Toda la función corre en una transacción implícita: si algo lanza, se
-- revierte el lote completo.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tenant_inventario_factura_migrate(
    p_user_id            uuid,
    p_factura_ids        text[],
    p_empresa_destino_id text
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

    v_supplier_map      jsonb := '{}'::jsonb;  -- source_proveedor_id -> target_proveedor_id
    v_product_map       jsonb := '{}'::jsonb;  -- source_producto_id  -> target_producto_id

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
        -- Cargar factura
        EXECUTE format(
            'SELECT * FROM %I.inventario_facturas_compra WHERE id = %L',
            v_schema, v_factura_id
        ) INTO v_factura;

        IF v_factura IS NULL THEN
            RAISE EXCEPTION 'Factura % no encontrada', v_factura_id;
        END IF;

        -- Saltar si ya está en destino
        IF v_factura.empresa_id = p_empresa_destino_id THEN
            v_skipped := v_skipped || jsonb_build_object(
                'id',     v_factura_id,
                'reason', 'already-in-target'
            );
            CONTINUE;
        END IF;

        -- Período cerrado en origen
        EXECUTE format(
            'SELECT EXISTS(SELECT 1 FROM %I.inventario_cierres WHERE empresa_id = %L AND periodo = %L)',
            v_schema, v_factura.empresa_id, v_factura.periodo
        ) INTO v_period_closed;
        IF v_period_closed THEN
            RAISE EXCEPTION 'El período % de la factura % está cerrado en la empresa origen',
                v_factura.periodo, v_factura_id;
        END IF;

        -- Período cerrado en destino
        EXECUTE format(
            'SELECT EXISTS(SELECT 1 FROM %I.inventario_cierres WHERE empresa_id = %L AND periodo = %L)',
            v_schema, p_empresa_destino_id, v_factura.periodo
        ) INTO v_period_closed;
        IF v_period_closed THEN
            RAISE EXCEPTION 'El período % de la factura % está cerrado en la empresa destino',
                v_factura.periodo, v_factura_id;
        END IF;

        v_source_empresa_id := v_factura.empresa_id;
        v_was_confirmed     := (v_factura.estado = 'confirmada');

        -- Si está confirmada, desconfirmar primero (revierte movimientos en origen)
        IF v_was_confirmed THEN
            PERFORM public.tenant_inventario_factura_desconfirmar(p_user_id, v_factura_id);
        END IF;

        -- ---- Resolver proveedor destino ------------------------------------
        IF v_supplier_map ? v_factura.proveedor_id THEN
            v_target_supplier_id := v_supplier_map->>v_factura.proveedor_id;
        ELSE
            v_target_supplier_id := NULL;

            -- Lookup por RIF (case-insensitive, trim) o por nombre si no hay RIF
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
                    -- Clonar con existencia/costo en cero. departamento_id se
                    -- deja NULL (es company-scoped en destino).
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

            -- Re-apuntar el item
            EXECUTE format(
                'UPDATE %I.inventario_facturas_compra_items SET producto_id = %L WHERE id = %L',
                v_schema, v_target_product_id, v_item.id
            );
        END LOOP;

        -- ---- Mover la factura al destino -----------------------------------
        EXECUTE format($q$
            UPDATE %I.inventario_facturas_compra
            SET empresa_id = %L,
                proveedor_id = %L,
                updated_at = now()
            WHERE id = %L
        $q$, v_schema, p_empresa_destino_id, v_target_supplier_id, v_factura_id);

        -- Si estaba confirmada, reconfirmar en destino (movimientos nuevos
        -- contra costo promedio del destino)
        IF v_was_confirmed THEN
            PERFORM public.tenant_inventario_factura_confirmar(p_user_id, v_factura_id);
        END IF;

        -- Releer cabecera para incluir totales/fecha en el resultado (la capa
        -- API los necesita para la integración contable)
        EXECUTE format(
            'SELECT id, fecha, subtotal, iva_monto, total FROM %I.inventario_facturas_compra WHERE id = %L',
            v_schema, v_factura_id
        ) INTO v_post_factura;

        v_migrated := v_migrated || jsonb_build_object(
            'id',                v_factura_id,
            'source_empresa_id', v_source_empresa_id,
            'target_empresa_id', p_empresa_destino_id,
            'was_confirmed',     v_was_confirmed,
            'fecha',             v_post_factura.fecha,
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
