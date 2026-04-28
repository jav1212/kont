// Infrastructure layer — Supabase RPC implementation of ICompanyRepository.
import { SupabaseClient } from '@supabase/supabase-js';
import { ICompanyRepository } from '../../domain/repository/company.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { Company, InventoryConfig, BusinessSector, BUSINESS_SECTORS, TaxpayerType, TAXPAYER_TYPES } from '../../domain/company';

// Raw DB row shape returned by tenant_company_* RPCs — never exported beyond this file.
interface RawCompanyRow {
    id:               string;
    owner_id:         string;
    name:             string;
    rif:              string | null;
    phone:            string | null;
    address:          string | null;
    contact_email:    string | null;
    logo_url:         string | null;
    show_logo_in_pdf: boolean | null;
    sector:           string | null;
    taxpayer_type:    string | null;
    inventory_config: Record<string, unknown> | null;
    created_at:       string | null;
    updated_at:       string | null;
}

export class RpcCompanyRepository implements ICompanyRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByOwnerId(_ownerId: string): Promise<Result<Company[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_companies_get_all', { p_user_id: this.userId });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawCompanyRow[]) ?? []).map((row: RawCompanyRow) => this.mapToDomain(row)));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error fetching companies');
        }
    }

    async findById(id: string): Promise<Result<Company | null>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_company_get_by_id', { p_user_id: this.userId, p_id: id });
            if (error) return Result.fail(error.message);
            if (!data) return Result.success(null);
            return Result.success(this.mapToDomain(data));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error finding company');
        }
    }

    async save(company: Company): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .rpc('tenant_company_save', {
                    p_user_id:       this.userId,
                    p_id:            company.id,
                    p_owner_id:      company.ownerId,
                    p_name:          company.name,
                    p_rif:           company.rif           ?? null,
                    p_phone:         company.phone         ?? null,
                    p_address:       company.address       ?? null,
                    p_logo_url:      company.logoUrl       ?? null,
                    p_sector:        company.sector        ?? null,
                    p_taxpayer_type: company.taxpayerType  ?? 'ordinario',
                    p_contact_email: company.contactEmail  ?? null,
                });
            if (error) return Result.fail(error.message);
            return Result.success();
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error saving company');
        }
    }

    async update(id: string, company: Partial<Company>): Promise<Result<Company>> {
        try {
            const currentRes = await this.findById(id);
            if (!currentRes.isSuccess) {
                return Result.fail('Error al buscar la empresa para actualizar');
            }
            const current = currentRes.getValue();
            if (!current) {
                return Result.fail('Empresa no encontrada para actualizar');
            }

            const { data, error } = await this.source.instance
                .rpc('tenant_company_update', {
                    p_user_id:           this.userId,
                    p_id:                id,
                    p_name:              company.name          ?? current.name,
                    p_rif:               (company.rif          !== undefined ? company.rif : current.rif) ?? null,
                    p_phone:             (company.phone        !== undefined ? company.phone : current.phone) ?? null,
                    p_address:           (company.address      !== undefined ? company.address : current.address) ?? null,
                    p_logo_url:          (company.logoUrl      !== undefined ? company.logoUrl : current.logoUrl) ?? null,
                    p_show_logo_in_pdf:  (company.showLogoInPdf!== undefined ? company.showLogoInPdf : current.showLogoInPdf) ?? null,
                    p_sector:            (company.sector       !== undefined ? company.sector : current.sector) ?? null,
                    p_taxpayer_type:     company.taxpayerType  !== undefined ? company.taxpayerType : null,
                    p_contact_email:     (company.contactEmail !== undefined ? company.contactEmail : current.contactEmail) ?? null,
                });
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error updating company');
        }
    }

    async delete(id: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .rpc('tenant_company_delete', { p_user_id: this.userId, p_id: id });
            if (error) return Result.fail(error.message);
            return Result.success();
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error deleting company');
        }
    }

    async getInventoryConfig(companyId: string): Promise<Result<InventoryConfig>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_company_get_inventory_config', {
                    p_user_id:    this.userId,
                    p_company_id: companyId,
                });
            if (error) return Result.fail(error.message);
            const raw = (data ?? {}) as Record<string, unknown>;
            return Result.success({
                customFields:          (raw.customFields as InventoryConfig['customFields']) ?? [],
                visibleColumns:        (raw.visibleColumns as string[]) ?? undefined,
                defaultMeasureUnit:    (raw.defaultMeasureUnit as string) ?? undefined,
                defaultValuationMethod:(raw.defaultValuationMethod as string) ?? undefined,
            });
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error fetching inventory config');
        }
    }

    async saveInventoryConfig(companyId: string, config: InventoryConfig): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .rpc('tenant_company_save_inventory_config', {
                    p_user_id:    this.userId,
                    p_company_id: companyId,
                    p_config:     config,
                });
            if (error) return Result.fail(error.message);
            return Result.success();
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error saving inventory config');
        }
    }

    private parseSector(raw: string | null): BusinessSector | undefined {
        if (!raw) return undefined;
        return BUSINESS_SECTORS.includes(raw as BusinessSector) ? (raw as BusinessSector) : undefined;
    }

    private parseTaxpayerType(raw: string | null): TaxpayerType {
        if (raw && TAXPAYER_TYPES.includes(raw as TaxpayerType)) return raw as TaxpayerType;
        return 'ordinario';
    }

    private parseInventoryConfig(raw: Record<string, unknown> | null): InventoryConfig | undefined {
        if (!raw || Object.keys(raw).length === 0) return undefined;
        return {
            customFields:          (raw.customFields as InventoryConfig['customFields']) ?? [],
            visibleColumns:        (raw.visibleColumns as string[]) ?? undefined,
            defaultMeasureUnit:    (raw.defaultMeasureUnit as string) ?? undefined,
            defaultValuationMethod:(raw.defaultValuationMethod as string) ?? undefined,
        };
    }

    private mapToDomain(row: RawCompanyRow): Company {
        return {
            id:              row.id,
            ownerId:         row.owner_id,
            name:            row.name,
            rif:             row.rif              ?? undefined,
            phone:           row.phone            ?? undefined,
            address:         row.address          ?? undefined,
            contactEmail:    row.contact_email    ?? undefined,
            logoUrl:         row.logo_url         ?? undefined,
            showLogoInPdf:   row.show_logo_in_pdf ?? false,
            sector:          this.parseSector(row.sector),
            taxpayerType:    this.parseTaxpayerType(row.taxpayer_type),
            inventoryConfig: this.parseInventoryConfig(row.inventory_config),
            createdAt:       row.created_at ? new Date(row.created_at) : undefined,
            updatedAt:       row.updated_at ? new Date(row.updated_at) : undefined,
        };
    }
}
