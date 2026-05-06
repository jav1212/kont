// Infrastructure layer — assembles the users module dependency graph.
// Wires SupabaseUserRepository into all use cases; callers must not instantiate use cases directly.
// Invariant: callers must not instantiate use cases directly; always go through this factory.
//
// Uses ServerSupabaseSource (service role) instead of the anon-key SupabaseSource:
// after migration 098 dropped `profiles_service_all`, RLS requires `auth.uid() = id`,
// and the anon-key client has no JWT here → every read fails with PGRST116 (→ 400).
// Authorization happens at the route layer (e.g. /api/users/get-by-id checks
// `id === requireTenant(req).userId` before calling the use case).
import { ServerSupabaseSource }   from '@/src/shared/backend/source/infra/server-supabase';
import { LocalEventBus }         from '@/src/shared/backend/infra/local-event-bus';
import { SupabaseUserRepository } from './repository/supabase-user.repository';
import { SaveUserUseCase }       from '../application/commands/save-user.use-case';
import { UpdateUserUseCase }     from '../application/commands/update-user.use-case';
import { DeleteUserUseCase }     from '../application/commands/delete-user.use-case';
import { GetAllUsersUseCase }    from '../application/queries/get-all-users.use-case';
import { GetUserByIdUseCase }    from '../application/queries/get-user-by-id.use-case';
import { GetUserByEmailUseCase } from '../application/queries/get-user-by-email.use-case';

export function getUserActions() {
    const source     = new ServerSupabaseSource();
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
