-- Shared-schema drafts for manual inventory operations.
-- A draft group is stored as one tenant-scoped JSON document. Confirmation
-- calls shared_inventory_movement_save inside the same transaction, so a
-- pilot tenant never promotes a draft through tenant_* RPCs.

create table if not exists public.shared_inventory_movement_drafts (
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    draft_group_id uuid not null,
    company_id text not null,
    kind text not null,
    direction text not null,
    iva_mode text not null,
    context jsonb not null default '{}'::jsonb,
    movements jsonb not null default '[]'::jsonb,
    updated_at timestamptz not null default now(),
    primary key (tenant_id, draft_group_id)
);

create index if not exists shared_inventory_movement_drafts_latest_idx
    on public.shared_inventory_movement_drafts (tenant_id, company_id, kind, updated_at desc);

alter table public.shared_inventory_movement_drafts enable row level security;

create or replace function public.shared_inventory_movement_draft_save(
    p_tenant_id uuid,
    p_company_id text,
    p_draft_group_id uuid,
    p_kind text,
    p_direction text,
    p_iva_mode text,
    p_context jsonb,
    p_movements jsonb
)
returns jsonb
language plpgsql security definer set search_path = public
as $function$
declare
    v_group uuid := coalesce(p_draft_group_id, gen_random_uuid());
    v_updated timestamptz := now();
begin
    insert into public.shared_inventory_movement_drafts
        (tenant_id, draft_group_id, company_id, kind, direction, iva_mode, context, movements, updated_at)
    values
        (p_tenant_id, v_group, p_company_id, p_kind, p_direction, p_iva_mode,
         coalesce(p_context, '{}'::jsonb), coalesce(p_movements, '[]'::jsonb), v_updated)
    on conflict (tenant_id, draft_group_id) do update set
        company_id = excluded.company_id,
        kind = excluded.kind,
        direction = excluded.direction,
        iva_mode = excluded.iva_mode,
        context = excluded.context,
        movements = excluded.movements,
        updated_at = excluded.updated_at;

    return jsonb_build_object('draftGroupId', v_group, 'count', jsonb_array_length(coalesce(p_movements, '[]'::jsonb)), 'updatedAt', v_updated);
end;
$function$;

create or replace function public.shared_inventory_movement_draft_confirm(
    p_tenant_id uuid, p_company_id text, p_draft_group_id uuid
)
returns jsonb
language plpgsql security definer set search_path = public
as $function$
declare
    v_draft public.shared_inventory_movement_drafts%rowtype;
    v_item jsonb;
    v_saved jsonb;
    v_ids jsonb := '[]'::jsonb;
begin
    select * into v_draft
      from public.shared_inventory_movement_drafts
     where tenant_id = p_tenant_id and company_id = p_company_id and draft_group_id = p_draft_group_id
     for update;
    if not found then raise exception 'Draft group not found or empty: %', p_draft_group_id; end if;

    for v_item in select value from jsonb_array_elements(v_draft.movements) loop
        v_saved := public.shared_inventory_movement_save(p_tenant_id, jsonb_build_object(
            'id', coalesce(v_item->>'id', ''),
            'empresa_id', p_company_id,
            'producto_id', coalesce(v_item->>'productoId', v_item->>'producto_id'),
            'tipo', v_item->>'tipo',
            'fecha', v_item->>'fecha',
            'cantidad', (v_item->>'cantidad')::numeric,
            'costo_unitario', (v_item->>'costoUnitario')::numeric,
            'moneda', coalesce(v_item->>'moneda', 'B'),
            'costo_moneda', nullif(v_item->>'costoMoneda', '')::numeric,
            'tasa_dolar', nullif(v_item->>'tasaDolar', '')::numeric,
            'referencia', coalesce(v_item->>'referencia', ''),
            'notas', coalesce(v_item->>'notas', ''),
            'descuento_tipo', coalesce(v_item->>'descuentoTipo', ''),
            'descuento_valor', coalesce((v_item->>'descuentoValor')::numeric, 0),
            'descuento_monto', coalesce((v_item->>'descuentoMonto')::numeric, 0),
            'recargo_tipo', coalesce(v_item->>'recargoTipo', ''),
            'recargo_valor', coalesce((v_item->>'recargoValor')::numeric, 0),
            'recargo_monto', coalesce((v_item->>'recargoMonto')::numeric, 0),
            'base_iva', nullif(v_item->>'baseIva', '')::numeric,
            'precio_venta_unitario', nullif(v_item->>'precioVentaUnitario', '')::numeric
        ));
        v_ids := v_ids || jsonb_build_array(v_saved->>'id');
    end loop;

    delete from public.shared_inventory_movement_drafts
     where tenant_id = p_tenant_id and draft_group_id = p_draft_group_id;
    return jsonb_build_object('count', jsonb_array_length(v_ids), 'confirmedIds', v_ids);
end;
$function$;

create or replace function public.shared_inventory_movement_draft_latest(
    p_tenant_id uuid, p_company_id text, p_kind text
)
returns jsonb language sql security definer set search_path = public as $function$
select case when d.draft_group_id is null then null else jsonb_build_object(
    'draftGroupId', d.draft_group_id, 'kind', d.kind, 'direction', d.direction,
    'ivaMode', d.iva_mode, 'context', d.context,
    'count', jsonb_array_length(d.movements),
    'totalCantidad', coalesce((select sum((x->>'cantidad')::numeric) from jsonb_array_elements(d.movements) x), 0),
    'updatedAt', d.updated_at
) end
from (select * from public.shared_inventory_movement_drafts
      where tenant_id = p_tenant_id and company_id = p_company_id and kind = p_kind
      order by updated_at desc limit 1) d;
$function$;

create or replace function public.shared_inventory_movement_draft_get(
    p_tenant_id uuid, p_company_id text, p_draft_group_id uuid
)
returns jsonb language sql security definer set search_path = public as $function$
select case when d.draft_group_id is null then null else jsonb_build_object(
    'meta', jsonb_build_object('draftGroupId', d.draft_group_id, 'kind', d.kind,
        'direction', d.direction, 'ivaMode', d.iva_mode, 'context', d.context,
        'fecha', coalesce(d.movements->0->>'fecha', ''), 'updatedAt', d.updated_at),
    'items', d.movements
) end
from public.shared_inventory_movement_drafts d
where d.tenant_id = p_tenant_id and d.company_id = p_company_id and d.draft_group_id = p_draft_group_id;
$function$;

create or replace function public.shared_inventory_movement_draft_discard(
    p_tenant_id uuid, p_company_id text, p_draft_group_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_count integer;
begin
    delete from public.shared_inventory_movement_drafts
     where tenant_id = p_tenant_id and company_id = p_company_id and draft_group_id = p_draft_group_id;
    get diagnostics v_count = row_count;
    return jsonb_build_object('deleted', v_count);
end;
$function$;

revoke all on table public.shared_inventory_movement_drafts from public, anon, authenticated;
revoke all on function public.shared_inventory_movement_draft_save(uuid,text,uuid,text,text,text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.shared_inventory_movement_draft_confirm(uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.shared_inventory_movement_draft_latest(uuid,text,text) from public, anon, authenticated;
revoke all on function public.shared_inventory_movement_draft_get(uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.shared_inventory_movement_draft_discard(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.shared_inventory_movement_draft_save(uuid,text,uuid,text,text,text,jsonb,jsonb) to service_role;
grant execute on function public.shared_inventory_movement_draft_confirm(uuid,text,uuid) to service_role;
grant execute on function public.shared_inventory_movement_draft_latest(uuid,text,text) to service_role;
grant execute on function public.shared_inventory_movement_draft_get(uuid,text,uuid) to service_role;
grant execute on function public.shared_inventory_movement_draft_discard(uuid,text,uuid) to service_role;
