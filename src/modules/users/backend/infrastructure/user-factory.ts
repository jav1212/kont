// Infrastructure layer — assembles the users module dependency graph.
// Wires SupabaseUserRepository into all use cases; callers must not instantiate use cases directly.
// Invariant: callers must not instantiate use cases directly; always go through this factory.
import { SupabaseSource }        from '@/src/shared/backend/source/infra/supabase';
import { LocalEventBus }         from '@/src/shared/backend/infra/local-event-bus';
import { SupabaseUserRepository } from './repository/supabase-user.repository';
import { SaveUserUseCase }       from '../application/commands/save-user.use-case';
import { UpdateUserUseCase }     from '../application/commands/update-user.use-case';
import { DeleteUserUseCase }     from '../application/commands/delete-user.use-case';
import { GetAllUsersUseCase }    from '../application/queries/get-all-users.use-case';
import { GetUserByIdUseCase }    from '../application/queries/get-user-by-id.use-case';
import { GetUserByEmailUseCase } from '../application/queries/get-user-by-email.use-case';

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
