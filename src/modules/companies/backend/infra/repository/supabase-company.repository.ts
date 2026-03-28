import { SupabaseClient } from '@supabase/supabase-js';
import { ICompanyRepository } from '../../domain/repository/company.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from "@/src/core/domain/result";
import { Company } from '../../domain/company';

// Raw DB row shape for the companies table — never exported beyond this file.
interface RawCompanyRow {
    id:         string;
    owner_id:   string;
    name:       string;
    created_at: string | null;
    updated_at: string | null;
}

export class SupabaseCompanyRepository implements ICompanyRepository {
    private readonly TABLE = 'companies';

    constructor(private readonly source: ISource<SupabaseClient>) {}

    async findById(id: string): Promise<Result<Company | null>> {
        try {
            const { data, error } = await this.source.instance
                .from(this.TABLE)
                .select('*')
                .eq('id', id)
                .single();

            if (error) return Result.fail(error.message);
            if (!data) return Result.success(null);

            return Result.success(this.mapToDomain(data));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error finding company');
        }
    }

    async findByOwnerId(ownerId: string): Promise<Result<Company[]>> {
        try {
            const { data, error } = await this.source.instance
                .from(this.TABLE)
                .select('*')
                .eq('owner_id', ownerId);

            if (error) return Result.fail(error.message);
            return Result.success((data || []).map(d => this.mapToDomain(d)));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error fetching companies');
        }
    }

    async save(company: Company): Promise<Result<void>> {
        try {
            const now = new Date().toISOString();
            const { error } = await this.source.instance
                .from(this.TABLE)
                .insert({
                    id:         company.id,
                    owner_id:   company.ownerId,
                    name:       company.name,
                    created_at: now,
                    updated_at: now,
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
                .from(this.TABLE)
                .update({
                    name:       company.name,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', id)
                .select()
                .single();

            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error updating company');
        }
    }

    async delete(id: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .from(this.TABLE)
                .delete()
                .eq('id', id);

            if (error) return Result.fail(error.message);
            return Result.success();
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error deleting company');
        }
    }

    private mapToDomain(row: RawCompanyRow): Company {
        return {
            id:        row.id,
            ownerId:   row.owner_id,
            name:      row.name,
            createdAt: row.created_at ? new Date(row.created_at) : undefined,
            updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
        };
    }
}