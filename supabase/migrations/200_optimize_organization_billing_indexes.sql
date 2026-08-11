-- Cover organization billing foreign keys used by joins and deletes.

create index if not exists organization_subscriptions_product_idx
    on public.organization_subscriptions(product_id);

create index if not exists organization_subscriptions_plan_idx
    on public.organization_subscriptions(plan_id)
    where plan_id is not null;

create index if not exists organization_invoices_subscription_idx
    on public.organization_invoices(subscription_id)
    where subscription_id is not null;
