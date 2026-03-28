// Infrastructure layer — Supabase RPC implementation of ICompanyRepository.
import { SupabaseClient } from '@supabase/supabase-js';
import { ICompanyRepository } from '../../domain/repository/company.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { Company } from '../../domain/company';

// Raw DB row shape returned by tenant_company_* RPCs — never exported beyond this file.
interface RawCompanyRow {
    id:               string;
    owner_id:         string;
    name:             string;
    rif:              string | null;
    phone:            string | null;
    address:          string | null;
    logo_url:         string | null;
    show_logo_in_pdf: boolean | null;
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
            return Result.success(((data as RawCompanyRow[]) ?? []).map(this.mapToDomain));
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
                    p_user_id:  this.userId,
                    p_id:       company.id,
                    p_owner_id: company.ownerId,
                    p_name:     company.name,
                    p_rif:      company.rif      ?? null,
                    p_phone:    company.phone    ?? null,
                    p_address:  company.address  ?? null,
                    p_logo_url: company.logoUrl  ?? null,
                });
            if (error) return Result.fail(error.message);
            return Result.success();
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error saving company');
        }
    }

    async update(id: string, company: Partial<Company>): Promise<Result<Company>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_company_update', {
                    p_user_id:           this.userId,
                    p_id:                id,
                    p_name:              company.name,
                    p_rif:               company.rif             ?? null,
                    p_phone:             company.phone           ?? null,
                    p_address:           company.address         ?? null,
                    p_logo_url:          company.logoUrl         ?? null,
                    p_show_logo_in_pdf:  company.showLogoInPdf   ?? null,
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

    private mapToDomain(row: RawCompanyRow): Company {
        return {
            id:            row.id,
            ownerId:       row.owner_id,
            name:          row.name,
            rif:           row.rif              ?? undefined,
            phone:         row.phone            ?? undefined,
            address:       row.address          ?? undefined,
            logoUrl:       row.logo_url         ?? undefined,
            showLogoInPdf: row.show_logo_in_pdf ?? false,
            createdAt:     row.created_at ? new Date(row.created_at) : undefined,
            updatedAt:     row.updated_at ? new Date(row.updated_at) : undefined,
        };
    }
}
