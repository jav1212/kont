begin;

-- Fiscal corrections must point to the immutable original fact in the same
-- tenant/company book. A JSON reference alone cannot provide a relational FK.
create or replace function public.shared_tax_reporting_validate_correction_fact()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_document_kind text;
  v_affected_fact_id text;
  v_original_snapshot jsonb;
  v_amount_snapshot jsonb;
  v_amount_text text;
  v_amount_path_text text;
  v_amount_path text[];
  v_original_amount numeric;
  v_prior_corrections numeric;
  v_new_amount numeric;
  v_correction_sign smallint;
begin
  v_document_kind := new.fact_snapshot->>'documentKind';
  if v_document_kind is null then
    raise exception 'TAX_REPORTING_INVALID';
  end if;
  if v_document_kind not in ('credit_note', 'debit_note', 'return') then
    return new;
  end if;

  if jsonb_typeof(new.fact_snapshot->'rateBreakdowns') is distinct from 'array' then
    raise exception 'TAX_REPORTING_INVALID';
  end if;
  v_correction_sign := case when v_document_kind = 'debit_note' then 1 else -1 end;
  for v_amount_snapshot in
    select value from jsonb_array_elements(jsonb_build_array(
      new.fact_snapshot->'signed'->'taxableBase'->'minorAmount',
      new.fact_snapshot->'signed'->'taxAmount'->'minorAmount',
      new.fact_snapshot->'signed'->'exemptBase'->'minorAmount',
      new.fact_snapshot->'signed'->'total'->'minorAmount',
      new.fact_snapshot->'deductible'->'amount'->'minorAmount'
    ))
    union all
    select breakdown->'taxableBase'->'minorAmount'
      from jsonb_array_elements(new.fact_snapshot->'rateBreakdowns') breakdown
    union all
    select breakdown->'taxAmount'->'minorAmount'
      from jsonb_array_elements(new.fact_snapshot->'rateBreakdowns') breakdown
  loop
    v_amount_text := v_amount_snapshot #>> '{}';
    if v_amount_text is null or v_amount_text !~ '^-?[0-9]+$' then
      raise exception 'TAX_REPORTING_INVALID';
    end if;
    if (v_correction_sign = -1 and v_amount_text::numeric > 0)
      or (v_correction_sign = 1 and v_amount_text::numeric < 0) then
      raise exception 'TAX_REPORTING_INVALID';
    end if;
  end loop;

  v_affected_fact_id := nullif(btrim(new.fact_snapshot->>'affectedFactId'), '');
  if v_affected_fact_id is null or v_affected_fact_id = new.id
    or nullif(btrim(new.fact_snapshot->>'affectedSourceId'), '') is null then
    raise exception 'TAX_REPORTING_CORRECTION_SOURCE_INVALID';
  end if;

  select f.fact_snapshot into v_original_snapshot
    from public.shared_tax_reporting_facts f
    where f.tenant_id = new.tenant_id
      and f.organization_id = new.organization_id
      and f.company_id = new.company_id
      and f.id = v_affected_fact_id
    for update;
  if not found
    or v_original_snapshot->>'documentKind' is distinct from 'invoice'
    or v_original_snapshot->'source'->>'id' is distinct from new.fact_snapshot->>'affectedSourceId'
    or v_original_snapshot->>'direction' is distinct from new.fact_snapshot->>'direction'
    or v_original_snapshot->'currency'->>'code' is distinct from new.fact_snapshot->'currency'->>'code'
    or v_original_snapshot->'currency'->>'minorUnit' is distinct from new.fact_snapshot->'currency'->>'minorUnit'
  then
    raise exception 'TAX_REPORTING_CORRECTION_SOURCE_INVALID';
  end if;

  if v_document_kind in ('credit_note', 'return') then
    for v_amount_path_text in select unnest(array[
      'signed.taxableBase.minorAmount',
      'signed.taxAmount.minorAmount',
      'signed.exemptBase.minorAmount',
      'signed.total.minorAmount',
      'deductible.amount.minorAmount'
    ])
    loop
      v_amount_path := string_to_array(v_amount_path_text, '.');
      v_original_amount := coalesce((v_original_snapshot #>> v_amount_path)::numeric, 0);
      v_new_amount := coalesce((new.fact_snapshot #>> v_amount_path)::numeric, 0);
      select coalesce(sum((f.fact_snapshot #>> v_amount_path)::numeric), 0)
        into v_prior_corrections
        from public.shared_tax_reporting_facts f
        where f.tenant_id = new.tenant_id
          and f.organization_id = new.organization_id
          and f.company_id = new.company_id
          and f.fact_snapshot->>'affectedFactId' = v_affected_fact_id
          and f.fact_snapshot->>'documentKind' in ('credit_note', 'return');
      if v_original_amount < 0 or v_prior_corrections + v_new_amount < -v_original_amount then
        raise exception 'TAX_REPORTING_CORRECTION_EXCEEDS_SOURCE';
      end if;
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists shared_tax_reporting_correction_fact_guard on public.shared_tax_reporting_facts;
create trigger shared_tax_reporting_correction_fact_guard
before insert on public.shared_tax_reporting_facts
for each row execute function public.shared_tax_reporting_validate_correction_fact();

-- Reporting persistence is exposed through the scoped SECURITY DEFINER RPCs;
-- callers must not bypass their actor, scope, idempotency, and immutability checks.
revoke all on table
  public.shared_tax_reporting_facts,
  public.shared_tax_reporting_fact_commands,
  public.shared_tax_reporting_declarations,
  public.shared_tax_reporting_declaration_commands
from public, anon, authenticated, service_role;

revoke all on function public.shared_tax_reporting_validate_correction_fact() from public, anon, authenticated, service_role;
commit;
