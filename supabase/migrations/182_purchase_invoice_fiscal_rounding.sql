-- Use commercial rounding for final fiscal IVA and invoice total.
do $$
declare
    v_definition text;
begin
    select pg_get_functiondef(p.oid)
    into v_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'shared_inventory_purchase_invoice_recalculate_totals'
      and pg_get_function_identity_arguments(p.oid) = 'p_tenant_id uuid, p_invoice_id text';

    if v_definition is null then
        raise exception 'Purchase invoice totals function was not found';
    end if;

    v_definition := replace(v_definition, 'v_vat_fiscal := trunc(v_vat_raw, 2);', 'v_vat_fiscal := round(v_vat_raw, 2);');
    v_definition := replace(v_definition, 'v_sign * trunc(v_subtotal_fiscal + v_vat_fiscal + v_extra_taxes, 2)', 'v_sign * round(v_subtotal_fiscal + v_vat_fiscal + v_extra_taxes, 2)');
    execute v_definition;
end;
$$;