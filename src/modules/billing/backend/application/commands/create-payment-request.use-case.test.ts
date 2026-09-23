import assert from 'node:assert/strict';
import test from 'node:test';
import { Result } from '@/src/core/domain/result';
import type { IBillingRepository, CreatePaymentRequestInput } from '../../domain/billing-repository';
import { CreatePaymentRequestUseCase } from './create-payment-request.use-case';

const kioskPlan = {
    id: 'kiosk-plan', name: 'Kiosco', maxCompanies: null, maxEmployeesPerCompany: null,
    priceMonthlyUsd: 6, priceQuarterlyUsd: 0, priceAnnualUsd: 0,
    moduleSlug: 'inventory', isContactOnly: false, includedModules: ['inventory', 'purchases', 'sales'], commercialCode: 'kiosk',
};

test('forged client amounts cannot undercharge or auto-approve Kiosco', async () => {
    let approved = false;
    const requests: CreatePaymentRequestInput[] = [];
    const repository = {
        async getPlans() { return Result.success([kioskPlan]); },
        async approveAndActivate(_tenantId: string, input: { discountUsd: number }) {
            approved = true;
            return Result.success({ id: 'request', tenantId: 'tenant', planId: 'kiosk-plan', billingCycle: 'monthly' as const, amountUsd: 0, discountUsd: input.discountUsd, paymentMethod: 'credit' as const, receiptUrl: null, status: 'approved' as const, notes: null, submittedAt: '', reviewedAt: null });
        },
        async createPaymentRequest(_tenantId: string, input: CreatePaymentRequestInput) {
            requests.push(input);
            return Result.success({ id: 'request', tenantId: 'tenant', ...input, discountUsd: input.discountUsd ?? 0, status: 'pending' as const, notes: null, submittedAt: '', reviewedAt: null });
        },
    } as unknown as IBillingRepository;
    const credits = { async execute() { return Result.success({ availableUsd: 0.01 }); } } as unknown as ConstructorParameters<typeof CreatePaymentRequestUseCase>[2];
    const result = await new CreatePaymentRequestUseCase(repository, undefined, credits).execute({ tenantId: 'tenant', planId: 'kiosk-plan', billingCycle: 'monthly', amountUsd: 0.01, paymentMethod: 'transfer', receiptUrl: null });

    assert.equal(result.isSuccess, true);
    assert.equal(approved, false);
    assert.equal(requests[0]?.amountUsd, 5.99);
    assert.equal(requests[0]?.discountUsd, 0.01);
});

test('disabled Kiosco cycles are rejected before payment persistence', async () => {
    let persisted = false;
    const repository = {
        async getPlans() { return Result.success([kioskPlan]); },
        async createPaymentRequest() { persisted = true; return Result.fail('must not persist'); },
    } as unknown as IBillingRepository;
    const result = await new CreatePaymentRequestUseCase(repository).execute({ tenantId: 'tenant', planId: 'kiosk-plan', billingCycle: 'quarterly', amountUsd: 999, paymentMethod: 'transfer', receiptUrl: null });

    assert.equal(result.isFailure, true);
    assert.equal(persisted, false);
});
