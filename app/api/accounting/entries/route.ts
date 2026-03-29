// Route handler for journal entries collection: GET (list), POST (save draft).
import { withTenant }           from '@/src/shared/backend/utils/require-tenant';
import { handleResult }         from '@/src/shared/backend/utils/handle-result';
import { getAccountingActions } from '@/src/modules/accounting/backend/infrastructure/accounting-factory';
import type { SaveEntryInput }  from '@/src/modules/accounting/backend/domain/repository/journal-entry.repository';

export const GET = withTenant(async (req, { userId, actingAs }) => {
    const ownerId   = actingAs?.ownerId ?? userId;
    const params    = new URL(req.url).searchParams;
    const companyId = params.get('companyId') ?? '';
    const periodId  = params.get('periodId') ?? undefined;
    const result    = await getAccountingActions(ownerId).getEntries.execute({ companyId, periodId });
    return handleResult(result);
});

export const POST = withTenant(async (req, { userId, actingAs }) => {
    const ownerId = actingAs?.ownerId ?? userId;
    const body    = await req.json() as SaveEntryInput;
    const result  = await getAccountingActions(ownerId).saveEntry.execute(body);
    return handleResult(result, 201);
});
