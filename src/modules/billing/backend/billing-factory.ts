// billing-factory — assembles the billing module dependency graph.
// Role: infrastructure entry point — constructs the repository and wires all use cases.
// Invariant: callers must not instantiate use cases directly; always go through this factory.

import { ServerSupabaseSource }          from "@/src/shared/backend/source/infra/server-supabase";
import { LocalEventBus }                 from "@/src/shared/backend/infra/local-event-bus";
import { SupabaseBillingRepository }     from "./infrastructure/repositories/supabase-billing.repository";
import { GetTenantUseCase }              from "./application/use-cases/get-tenant.use-case";
import { GetTenantSubscriptionsUseCase } from "./application/use-cases/get-tenant-subscriptions.use-case";
import { GetPlansUseCase }               from "./application/use-cases/get-plans.use-case";
import { GetTenantCapacityUseCase }      from "./application/use-cases/get-tenant-capacity.use-case";
import { GetPaymentRequestsUseCase }     from "./application/use-cases/get-payment-requests.use-case";
import { CreatePaymentRequestUseCase }   from "./application/use-cases/create-payment-request.use-case";

export function getBillingActions() {
    const repo     = new SupabaseBillingRepository(new ServerSupabaseSource());
    const eventBus = new LocalEventBus();

    return {
        getTenant:            new GetTenantUseCase(repo),
        getSubscriptions:     new GetTenantSubscriptionsUseCase(repo),
        getPlans:             new GetPlansUseCase(repo),
        getCapacity:          new GetTenantCapacityUseCase(repo),
        getPaymentRequests:   new GetPaymentRequestsUseCase(repo),
        createPaymentRequest: new CreatePaymentRequestUseCase(repo, eventBus),
    };
}
