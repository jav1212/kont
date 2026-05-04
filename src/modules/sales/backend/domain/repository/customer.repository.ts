import { Result } from '@/src/core/domain/result';
import { Customer } from '../customer';

export interface ICustomerRepository {
    findByCompany(companyId: string): Promise<Result<Customer[]>>;
    save(customer: Customer): Promise<Result<Customer>>;
    delete(id: string): Promise<Result<{ softDeleted: boolean }>>;
}
