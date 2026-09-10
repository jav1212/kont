import { Result } from "@/src/core/domain/result";
import { UseCase } from "@/src/core/domain/use-case";
import type { SetSystemErrorResolutionInput, SystemErrorRecord, SystemErrorRepository } from "../domain/system-error";

/** Changes the support resolution state of one centralized incident. */
export class SetSystemErrorResolutionUseCase extends UseCase<SetSystemErrorResolutionInput, SystemErrorRecord | null> {
    /**
     * Creates the command use case.
     * @param repository - Incident persistence port.
     */
    constructor(private readonly repository: SystemErrorRepository) {
        super();
    }

    /**
     * Validates a state transition request and delegates its atomic persistence.
     * @param input - Incident code, target status, and authenticated administrator.
     * @returns The updated or unchanged incident, null when it is absent, or a validation/persistence failure.
     */
    async execute(input: SetSystemErrorResolutionInput): Promise<Result<SystemErrorRecord | null>> {
        if (!input.errorCode.trim()) return Result.fail("errorCode is required");
        if (input.status !== "pending" && input.status !== "resolved") return Result.fail("status must be pending or resolved");
        if (!input.actorUserId) return Result.fail("actorUserId is required");
        return this.repository.setResolution(input);
    }
}
