import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { ICustomerRepository } from '../../domain/repository/customer.repository';
import { Customer } from '../../domain/customer';

type RawCustomer = {
    id: string | null;
    company_id: string;
    rif: string;
    name: string;
    contact: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    active: boolean | null;
    created_at: string | null;
    updated_at: string | null;
};

/** Shared-schema customer adapter. Every operation is scoped by tenant. */
export class SharedCustomerRepository implements ICustomerRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly tenantId: string,
    ) {}

    async findByCompany(companyId: string): Promise<Result<Customer[]>> {
        try {
            const { data, error } = await this.source.instance
                .from('shared_inventory_customers')
                .select('*')
                .eq('tenant_id', this.tenantId)
                .eq('company_id', companyId)
                .order('name', { ascending: true });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawCustomer[]) ?? []).map((row) => this.mapToDomain(row)));
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Failed to fetch shared customers');
        }
    }

    async save(customer: Customer): Promise<Result<Customer>> {
        try {
            const { data, error } = await this.source.instance
                .from('shared_inventory_customers')
                .upsert({
                    tenant_id: this.tenantId,
                    id: customer.id ?? undefined,
                    company_id: customer.companyId,
                    rif: customer.rif,
                    name: customer.name,
                    contact: customer.contact,
                    phone: customer.phone,
                    email: customer.email,
                    address: customer.address,
                    notes: customer.notes,
                    active: customer.active,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'tenant_id,id' })
                .select('*')
                .single();
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data as RawCustomer));
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Failed to save shared customer');
        }
    }

    async delete(id: string): Promise<Result<{ softDeleted: boolean }>> {
        try {
            const { error } = await this.source.instance
                .from('shared_inventory_customers')
                .update({ active: false, updated_at: new Date().toISOString() })
                .eq('tenant_id', this.tenantId)
                .eq('id', id);
            return error ? Result.fail(error.message) : Result.success({ softDeleted: true });
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Failed to delete shared customer');
        }
    }

    private mapToDomain(row: RawCustomer): Customer {
        return {
            id: row.id ?? undefined,
            companyId: row.company_id,
            rif: row.rif,
            name: row.name,
            contact: row.contact ?? '',
            phone: row.phone ?? '',
            email: row.email ?? '',
            address: row.address ?? '',
            notes: row.notes ?? '',
            active: row.active !== false,
            createdAt: row.created_at ?? undefined,
            updatedAt: row.updated_at ?? undefined,
        };
    }
}
