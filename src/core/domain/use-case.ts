import { Result } from "@/src/core/domain/result";

/**
 * Interface para Casos de Uso.
 * @template I Input del caso de uso
 * @template O Output del caso de uso (dentro del Result)
 */
export abstract class UseCase<I, O> {
    abstract execute(input: I): Promise<Result<O>>;
}