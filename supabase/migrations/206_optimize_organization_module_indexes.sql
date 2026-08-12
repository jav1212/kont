-- Cover module-management foreign keys. Additive only; no rows are modified.
create index module_dependencies_required_module_idx
  on public.module_dependencies(required_module_id);

create index organization_module_entitlements_module_idx
  on public.organization_module_entitlements(module_id);

create index organization_module_installations_module_idx
  on public.organization_module_installations(module_id);
