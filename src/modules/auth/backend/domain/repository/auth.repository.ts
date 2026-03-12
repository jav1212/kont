import { Result } from "@/src/core/domain/result";
import { Auth } from "../auth";

export interface IAuthRepository {
    signIn(email: string, pass: string): Promise<Result<Auth>>;
    signUp(email: string, pass: string): Promise<Result<Auth>>;
    signOut(): Promise<Result<void>>;
    getCurrentUser(): Promise<Result<Auth | null>>;
}