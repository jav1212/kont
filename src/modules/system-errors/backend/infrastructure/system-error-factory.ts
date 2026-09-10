import { ListSystemErrorsUseCase } from "../application/list-system-errors.use-case";
import { SetSystemErrorResolutionUseCase } from "../application/set-system-error-resolution.use-case";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { SupabaseSystemErrorRepository } from "./repository/supabase-system-error.repository";

/**
 * Creates the server-side dependencies for administrative incident operations.
 * @returns Use cases backed by the service-role Supabase adapter.
 */
export function getSystemErrorActions() {
    const repository = new SupabaseSystemErrorRepository(new ServerSupabaseSource());
    return {
        list: new ListSystemErrorsUseCase(repository),
        setResolution: new SetSystemErrorResolutionUseCase(repository),
    };
}
