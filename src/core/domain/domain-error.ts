// Domain error primitives for the kont backend.
// Role: domain boundary — provides typed error codes and a structured error class
//       so use cases and repositories can communicate failure reasons without stringly-typed messages.
// Invariant: ErrorCode values must never be reused across domains; extend the enum, never delete entries.

export enum ErrorCode {
    // Generic
    NOT_FOUND        = "NOT_FOUND",
    ALREADY_EXISTS   = "ALREADY_EXISTS",
    INVALID_INPUT    = "INVALID_INPUT",
    UNAUTHORIZED     = "UNAUTHORIZED",
    FORBIDDEN        = "FORBIDDEN",
    INTERNAL_ERROR   = "INTERNAL_ERROR",

    // Tenant / auth
    TENANT_NOT_FOUND = "TENANT_NOT_FOUND",
    SESSION_EXPIRED  = "SESSION_EXPIRED",

    // Business
    VALIDATION_FAILED   = "VALIDATION_FAILED",
    OPERATION_NOT_ALLOWED = "OPERATION_NOT_ALLOWED",
}

export class DomainError extends Error {
    public readonly code: ErrorCode;

    constructor(code: ErrorCode, message: string) {
        super(message);
        this.code = code;
        this.name = "DomainError";
    }

    static notFound(message: string): DomainError {
        return new DomainError(ErrorCode.NOT_FOUND, message);
    }

    static invalidInput(message: string): DomainError {
        return new DomainError(ErrorCode.INVALID_INPUT, message);
    }

    static unauthorized(message: string): DomainError {
        return new DomainError(ErrorCode.UNAUTHORIZED, message);
    }

    static forbidden(message: string): DomainError {
        return new DomainError(ErrorCode.FORBIDDEN, message);
    }

    static alreadyExists(message: string): DomainError {
        return new DomainError(ErrorCode.ALREADY_EXISTS, message);
    }

    static internal(message: string): DomainError {
        return new DomainError(ErrorCode.INTERNAL_ERROR, message);
    }
}
