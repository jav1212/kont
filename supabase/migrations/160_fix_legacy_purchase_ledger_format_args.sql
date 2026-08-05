-- Keep the legacy fallback operational during shared-schema observation.
create or replace function public.tenant_inventario_libro_compras(
    p_user_id uuid,
    p_empresa_id text,
    p_periodo text
)
returns jsonb
language plpgsql security definer set search_path = public
as $function$
declare
    v_schema text;
    v_result jsonb;
begin
    v_schema := public.tenant_get_schema(p_user_id);

    execute format($q$
        select coalesce(jsonb_agg(
            jsonb_build_object(
                'id', f.id,
                'fecha', f.fecha,
                'numero_factura', f.numero_factura,
                'numero_control', f.numero_control,
                'proveedor_rif', pv.rif,
                'proveedor_nombre', pv.nombre,
                'base_exenta', coalesce(exenta.monto, 0),
                'base_gravada_8', coalesce(gravada8.monto, 0),
                'iva_8', round(coalesce(gravada8.monto, 0) * 8 / 100, 2),
                'base_gravada_16', coalesce(gravada16.monto, 0),
                'iva_16', round(coalesce(gravada16.monto, 0) * 16 / 100, 2),
                'iva_retenido', coalesce(f.retencion_iva_monto, 0),
                'total', f.total
            ) order by f.fecha asc, f.numero_factura asc
        ), '[]'::jsonb)
        from %I.inventario_facturas_compra f
        join %I.inventario_proveedores pv on pv.id = f.proveedor_id
        left join lateral (
            select coalesce(sum(coalesce(nullif(i.base_iva, 0), i.costo_total)), 0) as monto
            from %I.inventario_facturas_compra_items i
            where i.factura_id = f.id and i.iva_alicuota = 'exenta'
        ) exenta on true
        left join lateral (
            select coalesce(sum(coalesce(nullif(i.base_iva, 0), i.costo_total)), 0) as monto
            from %I.inventario_facturas_compra_items i
            where i.factura_id = f.id and i.iva_alicuota = 'reducida_8'
        ) gravada8 on true
        left join lateral (
            select coalesce(sum(coalesce(nullif(i.base_iva, 0), i.costo_total)), 0) as monto
            from %I.inventario_facturas_compra_items i
            where i.factura_id = f.id and i.iva_alicuota = 'general_16'
        ) gravada16 on true
        where f.empresa_id = %L
          and f.periodo = %L
          and f.estado = 'confirmada'
    $q$, v_schema, v_schema, v_schema, v_schema, v_schema, p_empresa_id, p_periodo)
    into v_result;

    return coalesce(v_result, '[]'::jsonb);
end;
$function$;
