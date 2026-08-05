-- Make the service-role-only contract explicit for shared movement drafts.
drop policy if exists shared_inventory_movement_drafts_service_role
    on public.shared_inventory_movement_drafts;

create policy shared_inventory_movement_drafts_service_role
    on public.shared_inventory_movement_drafts
    for all to service_role
    using (true)
    with check (true);

grant all on table public.shared_inventory_movement_drafts to service_role;
