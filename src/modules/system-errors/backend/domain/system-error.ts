import type { Result } from "@/src/core/domain/result";

/** Supported incident resolution states. */
export type ResolutionStatus = "pending" | "resolved";

/**
 * Determines whether an unknown transport value is a supported resolution state.
 * @param value - Untrusted value supplied by a transport adapter.
 * @returns True when the value is a supported resolution state.
 */
export function isResolutionStatus(value: unknown): value is ResolutionStatus {
    return value === "pending" || value === "resolved";
}

/** Human-readable identity associated with an incident or its resolution. */
export interface SystemErrorUser {
    /** Supabase Auth user identifier. */
    readonly id: string;
    /** Optional profile name. */
    readonly name: string | null;
    /** Optional profile email. */
    readonly email: string | null;
}

/** Administrator-safe representation of a centralized system error. */
export interface SystemErrorRecord {
    /** Stable database identifier. */
    readonly id: string;
    /** Public support reference, for example KNT-20260910-7A32E2BB. */
    readonly errorCode: string;
    /** User-facing error text. */
    readonly message: string;
    /** Technical error detail restricted to administrators. */
    readonly technicalMessage: string | null;
    /** Captured stack trace restricted to administrators. */
    readonly stackTrace: string | null;
    /** Origin classification supplied by the recorder. */
    readonly source: string;
    /** Request path associated with the incident. */
    readonly route: string | null;
    /** HTTP method associated with the incident. */
    readonly method: string | null;
    /** HTTP status associated with the incident. */
    readonly statusCode: number | null;
    /** Legacy tenant attribution when known. */
    readonly tenantId: string | null;
    /** Auth user identifier of the reporting user when known. */
    readonly userId: string | null;
    /** Request/correlation identifier. */
    readonly requestId: string | null;
    /** Sanitized structured context persisted with the incident. */
    readonly metadata: Readonly<Record<string, unknown>>;
    /** Time at which the incident was persisted. */
    readonly createdAt: string;
    /** Current support resolution state. */
    readonly resolutionStatus: ResolutionStatus;
    /** Time at which an administrator resolved the incident. */
    readonly resolvedAt: string | null;
    /** Auth user identifier of the resolving administrator. */
    readonly resolvedBy: string | null;
    /** Reporting user profile when it is available. */
    readonly user: SystemErrorUser | null;
    /** Resolving administrator profile when it is available. */
    readonly resolver: SystemErrorUser | null;
}

/** A bounded page of system errors for the administration portal. */
export interface SystemErrorPage {
    /** Page items ordered from newest to oldest. */
    readonly items: SystemErrorRecord[];
    /** Total matching incidents across all pages. */
    readonly total: number;
    /** One-based requested page number. */
    readonly page: number;
    /** Maximum items requested for each page. */
    readonly pageSize: number;
}

/** Query accepted by the administrative incident list. */
export interface ListSystemErrorsInput {
    /** Optional resolution-state filter. */
    readonly status?: ResolutionStatus;
    /** Literal, case-insensitive substring of the incident code. */
    readonly code?: string;
    /** One-based requested page. */
    readonly page: number;
    /** Maximum records to return. */
    readonly pageSize: number;
}

/** State transition requested by an authenticated administrator. */
export interface SetSystemErrorResolutionInput {
    /** Incident support reference to update. */
    readonly errorCode: string;
    /** Target resolution state. */
    readonly status: ResolutionStatus;
    /** Auth identifier of the administrator making the transition. */
    readonly actorUserId: string;
}

/** Persistence port for centralized system-error administration. */
export interface SystemErrorRepository {
    /**
     * Lists incidents matching an administrator's validated query.
     * @param input - Pagination and optional filters.
     * @returns A page of mapped incident records, or an expected persistence error.
     */
    list(input: ListSystemErrorsInput): Promise<Result<SystemErrorPage>>;

    /**
     * Applies a resolution transition while preserving resolver information on no-op requests.
     * @param input - Validated target state and authenticated administrator identity.
     * @returns The updated or unchanged incident, null when its error code does not exist, or an expected persistence error.
     */
    setResolution(input: SetSystemErrorResolutionInput): Promise<Result<SystemErrorRecord | null>>;
}
