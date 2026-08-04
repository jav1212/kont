import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import {
    BUSINESS_SECTORS,
    Company,
    InventoryConfig,
    TAXPAYER_TYPES,
    BusinessSector,
    TaxpayerType,
} from '../../domain/company';
import { ICompanyRepository } from '../../domain/repository/company.repository';

type RawSharedCompany = {
    id: string;
    tenant_id: string;
    owner_id: string;
    name: string;
    rif: string | null;
    phone: string | null;
    address: string | null;
    contact_email: string | null;
    logo_url: string | null;
    show_logo_in_pdf: boolean | null;
    sector: string | null;
    taxpayer_type: string | null;
    inventory_config: Record<string, unknown> | null;
    created_at: string | null;
    updated_at: string | null;
};

/** Shared-schema adapter for the companies pilot. */
export class SharedCompanyRepository implements ICompanyRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly tenantId: string,
    ) {}

    async findByOwnerId(_ownerId: string): Promise<Result<Company[]>> {
        try {
            const { data, error } = await this.source.instance
                .from('shared_companies')
                .select('*')
                .eq('tenant_id', this.tenantId)
                .order('created_at', { ascending: true });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawSharedCompany[]) ?? []).map(row => this.mapToDomain(row)));
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Error fetching shared companies');
        }
    }

    async findById(id: string): Promise<Result<Company | null>> {
        try {
            const { data, error } = await this.source.instance
                .from('shared_companies')
                .select('*')
                .eq('tenant_id', this.tenantId)
                .eq('id', id)
                .maybeSingle();
            if (error) return Result.fail(error.message);
            return Result.success(data ? this.mapToDomain(data as RawSharedCompany) : null);
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Error finding shared company');
        }
    }

    async save(company: Company): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .from('shared_companies')
                .upsert(this.toRow(company), { onConflict: 'tenant_id,id' });
            return error ? Result.fail(error.message) : Result.success();
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Error saving shared company');
        }
    }

    async update(id: string, company: Partial<Company>): Promise<Result<Company>> {
        const currentResult = await this.findById(id);
        if (!currentResult.isSuccess) return Result.fail(currentResult.getError());
        const current = currentResult.getValue();
        if (!current) return Result.fail('Empresa no encontrada para actualizar');

        try {
            const { data, error } = await this.source.instance
                .from('shared_companies')
                .update(this.toRow({ ...current, ...company, id, ownerId: current.ownerId }))
                .eq('tenant_id', this.tenantId)
                .eq('id', id)
                .select('*')
                .single();
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data as RawSharedCompany));
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Error updating shared company');
        }
    }

    async delete(id: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .from('shared_companies')
                .delete()
                .eq('tenant_id', this.tenantId)
                .eq('id', id);
            return error ? Result.fail(error.message) : Result.success();
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Error deleting shared company');
        }
    }

    async getInventoryConfig(companyId: string): Promise<Result<InventoryConfig>> {
        const result = await this.findById(companyId);
        if (!result.isSuccess) return Result.fail(result.getError());
        return Result.success(result.getValue()?.inventoryConfig ?? { customFields: [] });
    }

    async saveInventoryConfig(companyId: string, config: InventoryConfig): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .from('shared_companies')
                .update({ inventory_config: config })
                .eq('tenant_id', this.tenantId)
                .eq('id', companyId);
            return error ? Result.fail(error.message) : Result.success();
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Error saving shared inventory config');
        }
    }

    private toRow(company: Company) {
        return {
            tenant_id: this.tenantId,
            id: company.id,
            owner_id: company.ownerId,
            name: company.name,
            rif: company.rif ?? null,
            phone: company.phone ?? null,
            address: company.address ?? null,
            contact_email: company.contactEmail ?? null,
            logo_url: company.logoUrl ?? null,
            show_logo_in_pdf: company.showLogoInPdf ?? false,
            sector: company.sector ?? null,
            taxpayer_type: company.taxpayerType ?? 'ordinario',
            inventory_config: company.inventoryConfig ?? {},
        };
    }

    private mapToDomain(row: RawSharedCompany): Company {
        const sector = BUSINESS_SECTORS.includes(row.sector as BusinessSector)
            ? row.sector as BusinessSector
            : undefined;
        const taxpayerType = TAXPAYER_TYPES.includes(row.taxpayer_type as TaxpayerType)
            ? row.taxpayer_type as TaxpayerType
            : 'ordinario';
        const inventoryConfig = row.inventory_config && Object.keys(row.inventory_config).length > 0
            ? {
                customFields: (row.inventory_config.customFields as InventoryConfig['customFields']) ?? [],
                visibleColumns: row.inventory_config.visibleColumns as string[] | undefined,
                defaultMeasureUnit: row.inventory_config.defaultMeasureUnit as string | undefined,
                defaultValuationMethod: row.inventory_config.defaultValuationMethod as string | undefined,
            }
            : undefined;

        return {
            id: row.id,
            ownerId: row.owner_id,
            name: row.name,
            rif: row.rif ?? undefined,
            phone: row.phone ?? undefined,
            address: row.address ?? undefined,
            contactEmail: row.contact_email ?? undefined,
            logoUrl: row.logo_url ?? undefined,
            showLogoInPdf: row.show_logo_in_pdf ?? false,
            sector,
            taxpayerType,
            inventoryConfig,
            createdAt: row.created_at ? new Date(row.created_at) : undefined,
            updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
        };
    }
}
