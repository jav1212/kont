// command.ts — marker interface for write (state-changing) operations.
// Role: core CQRS primitive — commands mutate state and emit domain events.
// Invariant: command implementations must not return query data beyond a minimal acknowledgement.
import { Result } from "./result";

export interface ICommand<TInput, TOutput> {
    execute(input: TInput): Promise<Result<TOutput>>;
}
