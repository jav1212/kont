// Infrastructure layer — Supabase adapter for IAuthRepository.
// Implements auth operations against Supabase Auth API.
// Uses the client-side PKCE source (SupabaseSource), not service-role.
import { SupabaseClient } from '@supabase/supabase-js';
import { IAuthRepository } from '../../domain/repository/auth.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Auth } from '../../domain/auth';
import { Result } from "@/src/core/domain/result";

export class SupabaseAuthRepository implements IAuthRepository {
    constructor(private readonly source: ISource<SupabaseClient>) { }

    async signIn(email: string, pass: string): Promise<Result<Auth>> {
        try {
            const { data, error } = await this.source.instance.auth.signInWithPassword({
                email,
                password: pass
            });

            if (error) return Result.fail(error.message);
            if (!data.user) return Result.fail('Auth failed: User not found');

            return Result.success({ id: data.user.id, email: data.user.email! });
        } catch {
            return Result.fail('Unexpected error during sign in');
        }
    }

    async signUp(email: string, pass: string, emailRedirectTo?: string): Promise<Result<Auth>> {
        try {
            const { data, error } = await this.source.instance.auth.signUp({
                email,
                password: pass,
                options: {
                    emailRedirectTo: emailRedirectTo ?? 'http://localhost:3000/api/auth/callback',
                },
            });

            // Do not reveal whether the email already exists — always respond with generic success.
            if (error && !error.message.toLowerCase().includes('already')) {
                return Result.fail('No se pudo completar el registro.');
            }

            // If the email already existed, Supabase returns a user with an empty identities array.
            const userId = data.user?.id ?? email;
            const userEmail = data.user?.email ?? email;

            return Result.success({ id: userId, email: userEmail });
        } catch {
            return Result.fail('No se pudo completar el registro.');
        }
    }

    async signOut(): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance.auth.signOut();
            if (error) return Result.fail(error.message);

            return Result.success();
        } catch {
            return Result.fail('Unexpected error during sign out');
        }
    }

    async getCurrentUser(): Promise<Result<Auth | null>> {
        try {
            const { data: { user }, error } = await this.source.instance.auth.getUser();

            if (error) return Result.fail(error.message);
            if (!user) return Result.success(null);

            return Result.success({
                id: user.id,
                email: user.email!,
            });
        } catch {
            return Result.fail('Unexpected error retrieving current user');
        }
    }

    async resetPassword(email: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance.auth.resetPasswordForEmail(email);
            if (error) return Result.fail(error.message);

            return Result.success();
        } catch {
            return Result.fail('Unexpected error during password reset');
        }
    }
}
