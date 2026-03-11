import { SupabaseClient } from '@supabase/supabase-js';
import { IUserRepository } from '../../domain/repository/user.repository';
import { ISource } from '@/src/backend/source/domain/repository/source.repository';
import { Result } from "@/src/core/domain/result";
import { User } from '../../domain/user';

export class SupabaseUserRepository implements IUserRepository {
    private readonly TABLE = 'profiles';

    constructor(private readonly source: ISource<SupabaseClient>) {}

    async findById(id: string): Promise<Result<User | null>> {
        try {
            const { data, error } = await this.source.instance
                .from(this.TABLE)
                .select('*')
                .eq('id', id)
                .single();

            if (error) return Result.fail(error.message);
            if (!data)  return Result.success(null);

            return Result.success(this.mapToDomain(data));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Unknown error');
        }
    }

    async save(user: User): Promise<Result<void>> {
        try {
            const now = new Date().toISOString();

            const { error } = await this.source.instance
                .from(this.TABLE)
                .insert({
                    id:         user.id,
                    email:      user.email,
                    name:       user.name      ?? null,
                    avatar_url: user.avatarUrl ?? null,
                    created_at: user.createdAt ? user.createdAt.toISOString() : now,
                    updated_at: user.updatedAt ? user.updatedAt.toISOString() : now,
                });

            if (error) return Result.fail(error.message);
            return Result.success();
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Save error');
        }
    }

    async update(id: string, user: Partial<User>): Promise<Result<User>> {
        try {
            const { data, error } = await this.source.instance
                .from(this.TABLE)
                .update({
                    name:       user.name      ?? null,
                    avatar_url: user.avatarUrl ?? null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', id)
                .select()
                .single();

            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Update error');
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
            return Result.fail(err instanceof Error ? err.message : 'Delete error');
        }
    }

    async findByEmail(email: string): Promise<Result<User | null>> {
        try {
            const { data, error } = await this.source.instance
                .from(this.TABLE)
                .select('*')
                .eq('email', email)
                .single();

            if (error) return Result.fail(error.message);
            return Result.success(data ? this.mapToDomain(data) : null);
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Search error');
        }
    }

    async findAll(): Promise<Result<User[]>> {
        try {
            const { data, error } = await this.source.instance
                .from(this.TABLE)
                .select('*');

            if (error) return Result.fail(error.message);
            return Result.success((data || []).map(d => this.mapToDomain(d)));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Fetch all error');
        }
    }

    private mapToDomain(data: any): User {
        return {
            id:        data.id,
            email:     data.email,
            name:      data.name      ?? undefined,
            avatarUrl: data.avatar_url ?? undefined,
            createdAt: data.created_at ? new Date(data.created_at) : undefined,
            updatedAt: data.updated_at ? new Date(data.updated_at) : undefined,
        };
    }
}