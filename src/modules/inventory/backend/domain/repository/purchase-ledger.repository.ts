// Repository interface: IPurchaseLedgerRepository
// Domain port — infrastructure must implement this interface.
import { Result } from '@/src/core/domain/result';
import { PurchaseLedgerRow } from '../purchase-ledger';

export interface IPurchaseLedgerRepository {
  getPurchaseLedger(companyId: string, period: string): Promise<Result<PurchaseLedgerRow[]>>;
}
