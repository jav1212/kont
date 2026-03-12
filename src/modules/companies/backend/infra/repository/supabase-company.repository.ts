import { SupabaseClient } from '@supabase/supabase-js';
import { ICompanyRepository } from '../../domain/repository/company.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from "@/src/core/domain/result";
import { Company } from '../../domain/company';

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
            const { error } = await this.source.instance
                .from(this.TABLE)
                .insert({
                    id: company.id,
                    owner_id: company.ownerId, // Mapeo a snake_case
                    name: company.name
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
                    name: company.name
                    // owner_id no se suele actualizar por seguridad
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

    private mapToDomain(data: any): Company {
        return {
            id: data.id,
            ownerId: data.owner_id,
            name: data.name,
            createdAt: data.created_at ? new Date(data.created_at) : undefined,
            updatedAt: data.updated_at ? new Date(data.updated_at) : undefined,
        };
    }
}