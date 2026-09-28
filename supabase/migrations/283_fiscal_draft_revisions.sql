begin;

alter table public.shared_fiscal_documents
  add column if not exists draft_revision integer not null default 1;
alter table public.shared_fiscal_documents
  add constraint shared_fiscal_documents_draft_revision_positive check (draft_revision >= 1);

create or replace function public.shared_fiscal_document_metadata(
  p_tenant_id uuid, p_organization_id uuid, p_company_id text, p_document_id text
) returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'draft_revision', d.draft_revision,
    'source', jsonb_build_object('kind', d.source_kind, 'id', d.source_id),
    'can_revise', d.source_kind = 'legacy_sales_invoice' and d.document_status = 'draft'
      and not exists (select 1 from public.shared_fiscal_issuance_commands c where c.tenant_id=d.tenant_id and c.document_id=d.id)
      and not exists (select 1 from public.shared_fiscal_issuance_attempts a where a.tenant_id=d.tenant_id and a.document_id=d.id)
  )
  from public.shared_fiscal_documents d
  where d.tenant_id=p_tenant_id and d.organization_id=p_organization_id
    and d.company_id=p_company_id and d.id=btrim(p_document_id)
$$;

create or replace function public.shared_fiscal_document_revise_draft(
  p_tenant_id uuid, p_organization_id uuid, p_company_id text, p_document_id text,
  p_expected_revision integer, p_reason text, p_idempotency_key text, p_actor_id uuid,
  p_expected_source_updated_at timestamptz, p_replacement_snapshot jsonb, p_occurred_at timestamptz
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_document public.shared_fiscal_documents%rowtype;
  v_event public.shared_fiscal_document_events%rowtype;
  v_existing public.shared_fiscal_document_events%rowtype;
  v_invoice record;
  v_to_revision integer;
  v_previous_snapshot jsonb;
begin
  if p_expected_revision is null or p_expected_revision < 1 or nullif(btrim(p_document_id),'') is null
     or p_reason is null or length(btrim(p_reason)) not between 1 and 500
     or p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 128
     or p_actor_id is null or p_occurred_at is null or p_expected_source_updated_at is null
     or p_replacement_snapshot is null or jsonb_typeof(p_replacement_snapshot) <> 'object'
     or p_replacement_snapshot->>'id' is distinct from btrim(p_document_id)
     or p_replacement_snapshot->>'companyId' is distinct from p_company_id
     or p_replacement_snapshot->>'status' is distinct from 'draft'
     or p_replacement_snapshot->>'direction' is distinct from 'issued' then
    raise exception 'FISCAL_DOCUMENT_INVALID';
  end if;
  if not exists (select 1 from public.shared_companies c where c.tenant_id=p_tenant_id and c.organization_id=p_organization_id and c.id=p_company_id) then
    raise exception 'FISCAL_DOCUMENT_OUTSIDE_COMPANY';
  end if;
  if not (exists (select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=p_actor_id and m.status='active')
    or exists (select 1 from public.organization_delegation_member_assignments a join public.organization_delegations d on d.id=a.delegation_id join public.organization_delegation_scopes s on s.delegation_id=d.id and s.scope='sales' where a.user_id=p_actor_id and a.status='active' and d.client_organization_id=p_organization_id and d.status='active' and d.valid_from<=now() and (d.valid_until is null or d.valid_until>now()))) then
    raise exception 'FISCAL_DOCUMENT_ACTOR_OUTSIDE_ORGANIZATION';
  end if;

  select * into v_document from public.shared_fiscal_documents d
   where d.tenant_id=p_tenant_id and d.organization_id=p_organization_id and d.company_id=p_company_id and d.id=btrim(p_document_id) for update;
  if not found then raise exception 'FISCAL_DOCUMENT_NOT_FOUND'; end if;

  -- Replays precede CAS: a browser retry after a committed replacement remains safe.
  select * into v_existing from public.shared_fiscal_document_events e
   where e.tenant_id=p_tenant_id and e.document_id=v_document.id and e.event_type='fiscal_document.revised' and e.idempotency_key=btrim(p_idempotency_key);
  if found then
    if v_existing.payload->>'actorId' = p_actor_id::text
       and (v_existing.payload->>'fromRevision')::integer = p_expected_revision
       and v_existing.payload->>'reason' = btrim(p_reason)
       and v_existing.payload->'replacementSnapshot' = p_replacement_snapshot then
      return jsonb_build_object(
        'document', to_jsonb(v_document) || jsonb_build_object(
          'document_snapshot', v_existing.payload->'replacementSnapshot',
          'document_status', 'draft',
          'draft_revision', (v_existing.payload->>'toRevision')::integer,
          'updated_at', v_existing.occurred_at
        ),
        'revision',(v_existing.payload->>'toRevision')::integer,'replayed',true
      );
    end if;
    raise exception 'FISCAL_DOCUMENT_IDEMPOTENCY_CONFLICT';
  end if;

  if v_document.document_status <> 'draft'
     or exists (select 1 from public.shared_fiscal_issuance_commands c where c.tenant_id=p_tenant_id and c.document_id=v_document.id)
     or exists (select 1 from public.shared_fiscal_issuance_attempts a where a.tenant_id=p_tenant_id and a.document_id=v_document.id) then
    raise exception 'FISCAL_DOCUMENT_TRANSITION_INVALID';
  end if;
  if v_document.source_kind <> 'legacy_sales_invoice' then raise exception 'FISCAL_DOCUMENT_SOURCE_CONFLICT'; end if;
  if v_document.draft_revision <> p_expected_revision or v_document.draft_revision = 2147483647 then
    raise exception 'FISCAL_DOCUMENT_REVISION_CONFLICT';
  end if;

  -- Lock the commercial source before committing so it cannot be unconfirmed mid-revision.
  select id, status, company_id, updated_at into v_invoice from public.shared_inventory_sales_invoices i
   where i.tenant_id=p_tenant_id and i.id=v_document.source_id and i.company_id=p_company_id for update;
  if not found or v_invoice.status <> 'confirmada' or v_invoice.updated_at <> p_expected_source_updated_at then raise exception 'FISCAL_DOCUMENT_SOURCE_CONFLICT'; end if;
  v_to_revision := v_document.draft_revision + 1;
  v_previous_snapshot := v_document.document_snapshot;
  update public.shared_fiscal_documents set document_snapshot=p_replacement_snapshot, draft_revision=v_to_revision, updated_at=p_occurred_at
   where tenant_id=p_tenant_id and id=v_document.id returning * into v_document;
  insert into public.shared_fiscal_document_events(tenant_id,document_id,event_type,idempotency_key,payload,occurred_at)
  values(p_tenant_id,v_document.id,'fiscal_document.revised',btrim(p_idempotency_key),jsonb_build_object(
    'fromRevision',p_expected_revision,'toRevision',v_to_revision,'reason',btrim(p_reason),'actorId',p_actor_id,
    'source',jsonb_build_object('kind',v_document.source_kind,'id',v_document.source_id),
    'previousSnapshot',v_previous_snapshot, 'replacementSnapshot',p_replacement_snapshot
  ),p_occurred_at) returning * into v_event;
  return jsonb_build_object('document',to_jsonb(v_document),'revision',v_to_revision,'replayed',false);
end; $$;

revoke all on function public.shared_fiscal_document_metadata(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.shared_fiscal_document_revise_draft(uuid,uuid,text,text,integer,text,text,uuid,timestamptz,jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.shared_fiscal_document_metadata(uuid,uuid,text,text) to service_role;
grant execute on function public.shared_fiscal_document_revise_draft(uuid,uuid,text,text,integer,text,text,uuid,timestamptz,jsonb,timestamptz) to service_role;
commit;
