-- Read model for native clients. Portal probing remains an independent process;
-- API requests only consume the latest persisted observation for each service.
create or replace view public.platform_status_latest_checks
with (security_invoker = true)
as
select
    service.id,
    service.slug,
    service.name,
    service.category,
    service.logo_url,
    service.display_order,
    latest.status,
    latest.response_time_ms,
    latest.checked_at
from public.status_services as service
left join lateral (
    select checks.status, checks.response_time_ms, checks.checked_at
    from public.status_checks as checks
    where checks.service_id = service.id
    order by checks.checked_at desc
    limit 1
) as latest on true
where service.active = true;

grant select on public.platform_status_latest_checks to authenticated, service_role;
