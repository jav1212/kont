import { Result } from "@/src/core/domain/result";
import { UseCase } from "@/src/core/domain/use-case";

const expectedFailures = new Set([
    "badge_user_not_member", "badge_user_ineligible", "badge_already_active",
]);

/** Application boundary for a single authorized terminal/carnet operation. */
export class BarcodeOperation<Input, Output> extends UseCase<Input, Output> {
    /**
     * Supplies the repository operation selected by the infrastructure factory.
     * @param operation - Authorized persistence capability; must not expose secrets in errors.
     */
    constructor(private readonly operation: (input: Input) => Promise<Output>) { super(); }

    /**
     * Executes an authorized operation and sanitizes infrastructure failures.
     * @param input - Validated command carrying server-authorized actor and scope.
     * @returns A value or a stable safe failure, never an adapter exception or token.
     */
    async execute(input: Input): Promise<Result<Output>> {
        try { return Result.success(await this.operation(input)); }
        catch (error) {
            return Result.fail(error instanceof Error && expectedFailures.has(error.message)
                ? error.message : "barcode_operation_failed");
        }
    }
}
