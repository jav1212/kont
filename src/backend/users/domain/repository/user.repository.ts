import { Result } from "@/src/core/domain/result";
import { User } from "../user";

export interface IUserRepository {
    save(user: User): Promise<Result<void>>;
    update(id: string, user: Partial<User>): Promise<Result<User>>;
    delete(id: string): Promise<Result<void>>;
    findById(id: string): Promise<Result<User | null>>;
    findByEmail(email: string): Promise<Result<User | null>>;
    findAll(): Promise<Result<User[]>>;
}