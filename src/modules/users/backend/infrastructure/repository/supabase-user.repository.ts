// Infrastructure layer — Supabase table implementation of IUserRepository using the profiles table.
import { SupabaseClient } from '@supabase/supabase-js';
import { IUserRepository } from '../../domain/repository/user.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from "@/src/core/domain/result";
import { User } from '../../domain/user';

// Raw DB row shape for the profiles table — never exported beyond this file.
interface RawUserRow {
    id:         string;
    email:      string;
    name:       string | null;
    avatar_url: string | null;
    created_at: string | null;
    updated_at: string | null;
}

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

    private mapToDomain(row: RawUserRow): User {
        return {
            id:        row.id,
            email:     row.email,
            name:      row.name      ?? undefined,
            avatarUrl: row.avatar_url ?? undefined,
            createdAt: row.created_at ? new Date(row.created_at) : undefined,
            updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
        };
    }
}
