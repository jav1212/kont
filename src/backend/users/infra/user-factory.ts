import { SupabaseSource } from '../../source/infra/supabase';
import { SupabaseUserRepository } from './repository/supabase-user.repository';
import { SaveUserUseCase } from '../app/save-user.case';
import { UpdateUserUseCase } from '../app/update-user.case';
import { DeleteUserUseCase } from '../app/delete-user.case';
import { GetAllUsersUseCase } from '../app/get-all-users.case';
import { GetUserByIdUseCase } from '../app/get-user-by-id.case';
import { GetUserByEmailUseCase } from '../app/get-user-by-email.case';

export function getUserActions() {
    const source = new SupabaseSource();
    const repository = new SupabaseUserRepository(source);

    return {
        save: new SaveUserUseCase(repository),
        update: new UpdateUserUseCase(repository),
        delete: new DeleteUserUseCase(repository),
        getAll: new GetAllUsersUseCase(repository),
        getById: new GetUserByIdUseCase(repository),
        getByEmail: new GetUserByEmailUseCase(repository),
    };
}

export function handleUserResult(result: any, successStatus: number = 200) {
    if (result.isFailure) {
        return Response.json({ error: result.getError() }, { status: 400 });
    }
    return Response.json({ data: result.getValue() }, { status: successStatus });
}