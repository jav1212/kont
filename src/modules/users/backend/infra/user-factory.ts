// user-factory — assembles the users module dependency graph.
// Role: infrastructure entry point — wires SupabaseUserRepository into all use cases.
// Invariant: callers must not instantiate use cases directly; always go through this factory.
import { SupabaseSource }      from '@/src/shared/backend/source/infra/supabase';
import { LocalEventBus }       from '@/src/shared/backend/infra/local-event-bus';
import { SupabaseUserRepository } from './repository/supabase-user.repository';
import { SaveUserUseCase }     from '../app/save-user.case';
import { UpdateUserUseCase }   from '../app/update-user.case';
import { DeleteUserUseCase }   from '../app/delete-user.case';
import { GetAllUsersUseCase }  from '../app/get-all-users.case';
import { GetUserByIdUseCase }  from '../app/get-user-by-id.case';
import { GetUserByEmailUseCase } from '../app/get-user-by-email.case';

export function getUserActions() {
    const source     = new SupabaseSource();
    const repository = new SupabaseUserRepository(source);
    const eventBus   = new LocalEventBus();

    return {
        save:       new SaveUserUseCase(repository, eventBus),
        update:     new UpdateUserUseCase(repository, eventBus),
        delete:     new DeleteUserUseCase(repository, eventBus),
        getAll:     new GetAllUsersUseCase(repository),
        getById:    new GetUserByIdUseCase(repository),
        getByEmail: new GetUserByEmailUseCase(repository),
    };
}
