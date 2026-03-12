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
        } catch (err) {
            return Result.fail('Unexpected error during sign in');
        }
    }

    async signUp(email: string, pass: string): Promise<Result<Auth>> {
        try {
            const { data, error } = await this.source.instance.auth.signUp({
                email,
                password: pass,
                options: {
                    emailRedirectTo: 'http://localhost:3000/api/auth/callback',
                },
            });

            if (error) return Result.fail(error.message);
            if (!data.user) return Result.fail('Registration failed: Could not create user');

            return Result.success({ id: data.user.id, email: data.user.email! });
        } catch (err) {
            return Result.fail('Unexpected error during sign up');
        }
    }

    async signOut(): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance.auth.signOut();
            if (error) return Result.fail(error.message);

            return Result.success();
        } catch (err) {
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
        } catch (err) {
            return Result.fail('Unexpected error retrieving current user');
        }
    }

    async resetPassword(email: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance.auth.resetPasswordForEmail(email);
            if (error) return Result.fail(error.message);

            return Result.success();
        } catch (err) {
            return Result.fail('Unexpected error during password reset');
        }
    }
}