// Infrastructure layer — Supabase adapter for IAuthRepository.
// Implements auth operations against Supabase Auth API.
// `source` is the client-side PKCE client (anon); `adminSource` (optional) is the
// service-role client used for admin-only ops like resendConfirmation.
import { SupabaseClient, User } from '@supabase/supabase-js';
import { IAuthRepository } from '../../domain/repository/auth.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Auth } from '../../domain/auth';
import { Result } from "@/src/core/domain/result";
import { sendConfirmationEmail } from '@/src/shared/backend/utils/send-confirmation-email';

export class SupabaseAuthRepository implements IAuthRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly adminSource?: ISource<SupabaseClient>,
    ) { }

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

    async resetPassword(email: string, redirectTo?: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance.auth.resetPasswordForEmail(email, {
                ...(redirectTo ? { redirectTo } : {}),
            });
            if (error) return Result.fail(error.message);

            return Result.success();
        } catch {
            return Result.fail('Unexpected error during password reset');
        }
    }

    async resendConfirmation(email: string, emailRedirectTo?: string): Promise<Result<void>> {
        if (!this.adminSource) {
            console.warn('[resendConfirmation] Admin source not configured');
            return Result.fail('Servicio no disponible en este momento.');
        }

        const admin = this.adminSource.instance;
        const normalized = email.trim().toLowerCase();

        try {
            // 1. Buscar al usuario por email. listUsers pagina de 1000 en 1000; iteramos
            //    hasta 10 páginas como tope de seguridad (cubre ~10k cuentas).
            let foundUser: User | null = null;
            for (let page = 1; page <= 10; page++) {
                const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
                if (error) {
                    console.warn('[resendConfirmation] listUsers error', { msg: error.message, status: error.status });
                    return Result.fail('No pudimos verificar tu cuenta. Intenta de nuevo.');
                }
                const match = data.users.find(u => u.email?.toLowerCase() === normalized);
                if (match) { foundUser = match; break; }
                if (data.users.length < 1000) break;
            }

            if (!foundUser) {
                return Result.fail('No encontramos una cuenta con ese correo. Regístrate primero.');
            }

            if (foundUser.email_confirmed_at) {
                return Result.fail('Este correo ya está confirmado. Intenta iniciar sesión.');
            }

            // 2. Generar un magic link: al usarlo confirma el email y loguea al usuario.
            const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
                type: 'magiclink',
                email: foundUser.email!,
                ...(emailRedirectTo ? { options: { redirectTo: emailRedirectTo } } : {}),
            });

            if (linkErr) {
                console.warn('[resendConfirmation] generateLink error', { msg: linkErr.message, status: linkErr.status });
                return Result.fail('No pudimos generar el enlace. Intenta de nuevo.');
            }

            const actionLink = linkData?.properties?.action_link;
            if (!actionLink) {
                console.warn('[resendConfirmation] generateLink returned no action_link', linkData);
                return Result.fail('No pudimos generar el enlace. Intenta de nuevo.');
            }

            // 3. Enviar el email vía Resend (evita el SMTP nativo de Supabase, rate-limited).
            await sendConfirmationEmail({ to: foundUser.email!, actionLink });

            return Result.success();
        } catch (e) {
            console.warn('[resendConfirmation] Unexpected error', e);
            return Result.fail('Error inesperado al reenviar el correo.');
        }
    }
}
