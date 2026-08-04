import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { ISupplierRepository } from '../../domain/repository/supplier.repository';
import { Supplier } from '../../domain/supplier';

type RawSupplier = {
    id: string | null;
    company_id: string;
    rif: string | null;
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

/** Shared-schema supplier adapter. Every query is scoped by tenant and company. */
export class SharedSupplierRepository implements ISupplierRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly tenantId: string,
    ) {}

    async findByCompany(companyId: string): Promise<Result<Supplier[]>> {
        try {
            const { data, error } = await this.source.instance
                .from('shared_inventory_suppliers')
                .select('*')
                .eq('tenant_id', this.tenantId)
                .eq('company_id', companyId)
                .order('name', { ascending: true });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawSupplier[]) ?? []).map((row) => this.mapToDomain(row)));
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Failed to fetch shared suppliers');
        }
    }

    async upsert(supplier: Supplier): Promise<Result<Supplier>> {
        try {
            const { data, error } = await this.source.instance
                .from('shared_inventory_suppliers')
                .upsert({
                    tenant_id: this.tenantId,
                    id: supplier.id ?? undefined,
                    company_id: supplier.companyId,
                    rif: supplier.rif,
                    name: supplier.name,
                    contact: supplier.contact,
                    phone: supplier.phone,
                    email: supplier.email,
                    address: supplier.address,
                    notes: supplier.notes,
                    active: supplier.active,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'tenant_id,id' })
                .select('*')
                .single();
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data as RawSupplier));
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Failed to save shared supplier');
        }
    }

    async delete(id: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .from('shared_inventory_suppliers')
                .delete()
                .eq('tenant_id', this.tenantId)
                .eq('id', id);
            return error ? Result.fail(error.message) : Result.success();
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Failed to delete shared supplier');
        }
    }

    private mapToDomain(row: RawSupplier): Supplier {
        return {
            id: row.id ?? undefined,
            companyId: row.company_id,
            rif: row.rif ?? '',
            name: row.name,
            contact: row.contact ?? '',
            phone: row.phone ?? '',
            email: row.email ?? '',
            address: row.address ?? '',
            notes: row.notes ?? '',
            active: Boolean(row.active ?? true),
            createdAt: row.created_at ?? undefined,
            updatedAt: row.updated_at ?? undefined,
        };
    }
}
