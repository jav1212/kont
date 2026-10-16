-- Cover the composite plan foreign key used by opening allocation lines.
create index shared_inventory_branch_opening_lines_plan_scope_idx
  on public.shared_inventory_branch_opening_lines(plan_id, tenant_id, company_id);
