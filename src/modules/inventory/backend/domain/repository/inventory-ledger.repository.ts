// Repository interface: IInventoryLedgerRepository
// Domain port — infrastructure must implement this interface.
import { Result } from '@/src/core/domain/result';
import { InventoryLedgerRow } from '../inventory-ledger';

export interface IInventoryLedgerRepository {
  getInventoryLedger(companyId: string, year: number): Promise<Result<InventoryLedgerRow[]>>;
}
