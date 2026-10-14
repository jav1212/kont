-- Keep configured legal categories aligned with their IVA component.
-- Existing catalogues were checked before rollout; no rules required repair.
begin;

alter table public.shared_company_tax_rules
  add constraint shared_company_tax_rules_component_category_check
  check (
    (legal_component = 'base' and tax_category not in ('luxury_surcharge', 'payment_surcharge'))
    or (legal_component = 'luxury' and tax_category = 'luxury_surcharge' and treatment = 'taxed')
    or (legal_component = 'payment' and tax_category = 'payment_surcharge' and treatment = 'taxed')
  );

commit;
