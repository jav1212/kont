// Route handler for integration rules: GET (list), POST (save).
import { withTenant }                  from '@/src/shared/backend/utils/require-tenant';
import { handleResult }                from '@/src/shared/backend/utils/handle-result';
import { getAccountingActions }        from '@/src/modules/accounting/backend/infrastructure/accounting-factory';
import type { SaveIntegrationRuleInput } from '@/src/modules/accounting/backend/domain/repository/integration-rule.repository';
import type { IntegrationSource }      from '@/src/modules/accounting/backend/domain/integration-rule';

export const GET = withTenant(async (req, { userId, actingAs }) => {
    const ownerId   = actingAs?.ownerId ?? userId;
    const params    = new URL(req.url).searchParams;
    const companyId = params.get('companyId') ?? '';
    const source    = (params.get('source') ?? undefined) as IntegrationSource | undefined;
    const result    = await getAccountingActions(ownerId).getIntegrationRules.execute({ companyId, source });
    return handleResult(result);
});

export const POST = withTenant(async (req, { userId, actingAs }) => {
    const ownerId = actingAs?.ownerId ?? userId;
    const body    = await req.json() as SaveIntegrationRuleInput;
    const result  = await getAccountingActions(ownerId).saveIntegrationRule.execute(body);
    return handleResult(result, 201);
});
