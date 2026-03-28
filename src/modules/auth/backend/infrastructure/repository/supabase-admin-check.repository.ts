// Infrastructure layer — Supabase adapter for IAdminCheckRepository.
// Role: queries the public admin_users table using service-role credentials.
// Invariant: must never use the PKCE/anon client — service role is required to bypass RLS.
import { SupabaseClient } from '@supabase/supabase-js';
import { IAdminCheckRepository } from '../../domain/repository/admin-check.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';

export class SupabaseAdminCheckRepository implements IAdminCheckRepository {
    constructor(private readonly source: ISource<SupabaseClient>) { }

    async isAdmin(userId: string): Promise<Result<boolean>> {
        try {
            const { data, error } = await this.source.instance
                .from('admin_users')
                .select('id')
                .eq('id', userId)
                .single();

            if (error && error.code !== 'PGRST116') {
                // PGRST116 = row not found — expected when user is not an admin.
                return Result.fail(error.message);
            }

            return Result.success(!!data);
        } catch {
            return Result.fail('Unexpected error during admin check');
        }
    }
}
