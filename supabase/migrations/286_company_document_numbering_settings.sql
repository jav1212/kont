-- Exposes the two company-scoped commercial counters already consumed by the
-- transactional sales save RPC. Requires local migration 285 first.
-- This migration is prepared locally only; it has not been applied remotely.
-- Locking shared_companies serializes edits with sales number allocation.

create or replace function public.get_native_company_document_numbering(
    p_actor_user_id uuid, p_organization_id uuid, p_company_id text,
    p_expected_version integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_tenant_id uuid;
    v_company public.shared_companies%rowtype;
begin
    v_tenant_id := public.assert_company_administration_access(
        p_organization_id, p_actor_user_id, 'companies.update');
    select * into v_company from public.shared_companies
    where tenant_id = v_tenant_id and organization_id = p_organization_id and id = p_company_id
    for share;
    if not found then raise exception 'COMPANY_NOT_FOUND'; end if;
    if v_company.status <> 'active' then raise exception 'COMPANY_TRANSITION_INVALID'; end if;
    if p_expected_version is null or v_company.version <> p_expected_version then
        raise exception 'COMPANY_VERSION_CONFLICT';
    end if;
    return jsonb_build_object(
        'sales_invoice_next_number', coalesce(v_company.proximo_numero_factura_venta, 1),
        'delivery_note_next_number', coalesce(v_company.proximo_numero_nota_entrega, 1),
        'company_version', v_company.version
    );
end;
$$;

create or replace function public.update_native_company_document_numbering(
    p_actor_user_id uuid, p_organization_id uuid, p_company_id text,
    p_expected_version integer, p_sales_invoice_next_number integer,
    p_delivery_note_next_number integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_tenant_id uuid;
    v_company public.shared_companies%rowtype;
    v_previous_version integer;
begin
    v_tenant_id := public.assert_company_administration_access(
        p_organization_id, p_actor_user_id, 'companies.update');
    if p_expected_version is null or p_expected_version < 1
        or (p_sales_invoice_next_number is null and p_delivery_note_next_number is null)
        -- The deployed sales allocator uses lpad(text, 8, '0'), which truncates
        -- longer numbers rather than preserving them.
        or p_sales_invoice_next_number > 99999999
        or p_delivery_note_next_number > 99999999
        or coalesce(p_sales_invoice_next_number, 1) < 1
        or coalesce(p_delivery_note_next_number, 1) < 1
    then raise exception 'COMPANY_DOCUMENT_NUMBER_INVALID'; end if;

    -- The sales-save RPC takes this same row lock before reading/incrementing.
    select * into v_company from public.shared_companies
    where tenant_id = v_tenant_id and organization_id = p_organization_id and id = p_company_id
    for update;
    if not found then raise exception 'COMPANY_NOT_FOUND'; end if;
    if v_company.status <> 'active' then raise exception 'COMPANY_TRANSITION_INVALID'; end if;
    if v_company.version <> p_expected_version then raise exception 'COMPANY_VERSION_CONFLICT'; end if;
    if p_sales_invoice_next_number is not null
        and p_sales_invoice_next_number < coalesce(v_company.proximo_numero_factura_venta, 1)
        or p_delivery_note_next_number is not null
        and p_delivery_note_next_number < coalesce(v_company.proximo_numero_nota_entrega, 1)
    then raise exception 'COMPANY_DOCUMENT_NUMBER_REWIND'; end if;
    if p_sales_invoice_next_number is not null and exists (
        select 1 from public.shared_inventory_sales_invoices i
        where i.tenant_id = v_tenant_id and i.company_id = p_company_id
            and i.invoice_number = lpad(p_sales_invoice_next_number::text, 8, '0')
    ) or p_delivery_note_next_number is not null and exists (
        select 1 from public.shared_inventory_sales_invoices i
        where i.tenant_id = v_tenant_id and i.company_id = p_company_id
            and i.invoice_number = 'NE-' || lpad(p_delivery_note_next_number::text, 8, '0')
    ) then raise exception 'COMPANY_DOCUMENT_NUMBER_IN_USE'; end if;
    v_previous_version := v_company.version;

    update public.shared_companies set
        proximo_numero_factura_venta = coalesce(p_sales_invoice_next_number, proximo_numero_factura_venta, 1),
        proximo_numero_nota_entrega = coalesce(p_delivery_note_next_number, proximo_numero_nota_entrega, 1)
    where tenant_id = v_tenant_id and organization_id = p_organization_id and id = p_company_id
    returning * into v_company;
    insert into public.shared_company_administration_events(
        organization_id, company_id, actor_user_id, action, previous_version, version
    ) values (
        p_organization_id, p_company_id, p_actor_user_id, 'document_numbering_updated',
        v_previous_version, v_company.version
    );
    return jsonb_build_object(
        'sales_invoice_next_number', coalesce(v_company.proximo_numero_factura_venta, 1),
        'delivery_note_next_number', coalesce(v_company.proximo_numero_nota_entrega, 1),
        'company_version', v_company.version
    );
end;
$$;

revoke all on function public.get_native_company_document_numbering(uuid, uuid, text, integer),
    public.update_native_company_document_numbering(uuid, uuid, text, integer, integer, integer)
from public, anon, authenticated;
grant execute on function
    public.get_native_company_document_numbering(uuid, uuid, text, integer),
    public.update_native_company_document_numbering(uuid, uuid, text, integer, integer, integer)
to service_role;
