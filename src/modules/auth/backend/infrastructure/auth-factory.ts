// Infrastructure layer — auth module factory.
// Assembles the dependency graph: repository adapters → use case instances.
// API routes import only this factory; they never reference infra adapters directly.
import { SignInUseCase } from '../application/sign-in.use-case';
import { SignUpUseCase } from '../application/sign-up.use-case';
import { SignOutUseCase } from '../application/sign-out.use-case';
import { GetCurrentUserUseCase } from '../application/get-current-user.use-case';
import { ResetPasswordUseCase } from '../application/reset-password.use-case';
import { CheckIsAdminUseCase } from '../application/check-is-admin.use-case';
import { SupabaseSource } from '@/src/shared/backend/source/infra/supabase';
import { ServerSupabaseSource } from '@/src/shared/backend/source/infra/server-supabase';
import { SupabaseAuthRepository } from './repository/supabase-auth.repository';
import { SupabaseAdminCheckRepository } from './repository/supabase-admin-check.repository';

export function getAuthActions() {
    const source = new SupabaseSource();
    const authRepository = new SupabaseAuthRepository(source);

    const serviceSource = new ServerSupabaseSource();
    const adminCheckRepository = new SupabaseAdminCheckRepository(serviceSource);

    return {
        signIn: new SignInUseCase(authRepository),
        signUp: new SignUpUseCase(authRepository),
        signOut: new SignOutUseCase(authRepository),
        me: new GetCurrentUserUseCase(authRepository),
        resetPassword: new ResetPasswordUseCase(authRepository),
        checkIsAdmin: new CheckIsAdminUseCase(adminCheckRepository),
    };
}
