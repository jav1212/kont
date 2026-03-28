// query.ts — marker interface for read-only operations.
// Role: core CQRS primitive — queries read state and must never mutate it.
// Invariant: implementations must produce no side effects and publish no domain events.
import { Result } from "./result";

export interface IQuery<TInput, TOutput> {
    execute(input: TInput): Promise<Result<TOutput>>;
}
