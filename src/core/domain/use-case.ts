// use-case.ts — abstract base class for all application use cases.
// Role: core application primitive — every use case extends this and implements execute().
// @template I - Input type for the use case.
// @template O - Output type wrapped inside Result<O>.
import { Result } from "@/src/core/domain/result";

export abstract class UseCase<I, O> {
    abstract execute(input: I): Promise<Result<O>>;
}