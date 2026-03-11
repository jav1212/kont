import { SignInUseCase } from '../app/sign-in.case';
import { SignUpUseCase } from '../app/sign-up.case';
import { SignOutUseCase } from '../app/sign-out.case';
import { GetCurrentUserUseCase } from '../app/get-current-user';
import { SupabaseSource } from '../../source/infra/supabase';
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

export function handleResult(result: any, successStatus: number = 200) {
    if (result.isFailure) {
        return Response.json({ error: result.getError() }, { status: 400 });
    }
    return Response.json({ data: result.getValue() }, { status: successStatus });
}