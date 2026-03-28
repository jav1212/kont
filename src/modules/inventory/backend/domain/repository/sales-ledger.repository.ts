// Repository interface: ISalesLedgerRepository
// Domain port — infrastructure must implement this interface.
import { Result } from '@/src/core/domain/result';
import { SalesLedgerRow } from '../sales-ledger';

export interface ISalesLedgerRepository {
  getSalesLedger(companyId: string, period: string): Promise<Result<SalesLedgerRow[]>>;
}
