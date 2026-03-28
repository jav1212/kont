// Domain port — admin membership check.
// Role: repository contract that decouples the admin-check use case from Supabase specifics.
// Invariant: implementations must query the public admin_users table via service-role access only.
import { Result } from "@/src/core/domain/result";

export interface IAdminCheckRepository {
    isAdmin(userId: string): Promise<Result<boolean>>;
}
