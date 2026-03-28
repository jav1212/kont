// Infrastructure layer — auth module factory.
// Assembles the dependency graph: repository adapter → use case instances.
// API routes import only this factory; they never reference infra directly.
import { SignInUseCase } from '../application/sign-in.use-case';
import { SignUpUseCase } from '../application/sign-up.use-case';
import { SignOutUseCase } from '../application/sign-out.use-case';
import { GetCurrentUserUseCase } from '../application/get-current-user.use-case';
import { SupabaseSource } from '@/src/shared/backend/source/infra/supabase';
import { SupabaseAuthRepository } from './repository/supabase-auth.repository';

export function getAuthActions() {
    const source = new SupabaseSource();
    const authRepository = new SupabaseAuthRepository(source);

    return {
        signIn: new SignInUseCase(authRepository),
        signUp: new SignUpUseCase(authRepository),
        signOut: new SignOutUseCase(authRepository),
        me: new GetCurrentUserUseCase(authRepository),
    };
}
