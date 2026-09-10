import { Result } from "@/src/core/domain/result";
import { UseCase } from "@/src/core/domain/use-case";
import type { ListSystemErrorsInput, SystemErrorPage, SystemErrorRepository } from "../domain/system-error";

const MAXIMUM_PAGE = 10_000;

/** Lists a validated page of system incidents for platform administrators. */
export class ListSystemErrorsUseCase extends UseCase<ListSystemErrorsInput, SystemErrorPage> {
    /**
     * Creates the query use case.
     * @param repository - Incident persistence port.
     */
    constructor(private readonly repository: SystemErrorRepository) {
        super();
    }

    /**
     * Validates pagination and delegates the list query.
     * @param input - Filter and pagination request.
     * @returns A page of incidents or a validation/persistence failure.
     */
    async execute(input: ListSystemErrorsInput): Promise<Result<SystemErrorPage>> {
        if (!Number.isSafeInteger(input.page) || input.page < 1 || input.page > MAXIMUM_PAGE) {
            return Result.fail("page must be an integer between 1 and 10000");
        }
        if (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) {
            return Result.fail("pageSize must be an integer between 1 and 100");
        }
        if (input.status && input.status !== "pending" && input.status !== "resolved") {
            return Result.fail("status must be pending or resolved");
        }
        if (input.code && (!/^[A-Za-z0-9-]{1,32}$/.test(input.code))) {
            return Result.fail("code must contain at most 32 letters, numbers, or hyphens");
        }
        return this.repository.list(input);
    }
}
