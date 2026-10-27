import type { ClassifiedFailure, FailureClassifier } from "@kontave/client-feedback/application";
import { KontaveRemoteFailure } from "@kontave/client-remote";
import { isIncidentCode } from "@kontave/observability/contracts";
import { DomainError } from "@/src/core/domain/domain-error";
import { ApiRequestFailure } from "./api-request-failure";

export const NETWORK_UNAVAILABLE_MESSAGE = "No hay conexión con el servidor. Verifica tu conexión e intenta de nuevo.";

const NETWORK_FAILURE = /failed to fetch|networkerror|load failed|network request failed/i;

/**
 * Web policy that decides which failures are expected, which were already recorded by the API, and which
 * must become new incidents. Anything it does not recognize is reported.
 */
export class WebFailureClassifier implements FailureClassifier {
    /**
     * Classifies a failure caught by a Web screen, hook, or client.
     * @param error - Thrown or rejected value.
     * @returns `expected` for user-correctable failures, `reported` for server incidents with a `KNT-…` code,
     * or `null` for programming errors and unrecorded server failures.
     */
    classify(error: unknown): ClassifiedFailure | null {
        if (isNetworkFailure(error)) return { kind: "expected", code: null, message: NETWORK_UNAVAILABLE_MESSAGE };
        if (error instanceof KontaveRemoteFailure) return classifyRemoteFailure(error);
        if (error instanceof DomainError) return { kind: "expected", code: error.code, message: error.message };
        const http = httpFailure(error);
        if (http) return classifyHttpFailure(http);
        // Transitional rule: the Web historically throws `new Error(publicMessage)` for rejected requests and
        // client-side validation. Only exact `Error` instances qualify; built-in subclasses such as TypeError or
        // ReferenceError are programming errors and are reported. New code throws ApiRequestFailure instead.
        if (error instanceof Error && Object.getPrototypeOf(error) === Error.prototype && error.message.trim()) {
            return { kind: "expected", code: null, message: error.message };
        }
        return null;
    }
}

interface HttpFailure {
    readonly status: number;
    readonly message: string;
    readonly code: string | null;
}

/** Reads ApiRequestFailure and legacy module errors (IvaClientError, PayablesRequestFailure, Supabase AuthApiError) by shape. */
function httpFailure(error: unknown): HttpFailure | null {
    if (error instanceof ApiRequestFailure) return { status: error.status, message: error.message, code: error.errorCode };
    if (!(error instanceof Error)) return null;
    const candidate = error as Error & { status?: unknown; code?: unknown; errorCode?: unknown };
    if (typeof candidate.status !== "number" || candidate.status < 400) return null;
    const code = typeof candidate.errorCode === "string" ? candidate.errorCode
        : typeof candidate.code === "string" ? candidate.code
        : null;
    return { status: candidate.status, message: error.message, code };
}

function classifyHttpFailure(failure: HttpFailure): ClassifiedFailure | null {
    if (failure.status >= 500) {
        return isIncidentCode(failure.code) && failure.message.trim()
            ? { kind: "reported", referenceCode: failure.code, message: failure.message }
            : null;
    }
    if (!failure.message.trim()) return null;
    return { kind: "expected", code: failure.code, message: failure.message };
}

function classifyRemoteFailure(error: KontaveRemoteFailure): ClassifiedFailure | null {
    if (error.code === "NETWORK_UNAVAILABLE") return { kind: "expected", code: null, message: NETWORK_UNAVAILABLE_MESSAGE };
    if (error.code === "INVALID_RESPONSE" || error.code.endsWith("REPOSITORY_UNAVAILABLE")) return null;
    return { kind: "expected", code: error.code, message: error.message };
}

function isNetworkFailure(error: unknown): boolean {
    if (!(error instanceof TypeError)) return false;
    return NETWORK_FAILURE.test(error.message) || (typeof navigator !== "undefined" && navigator.onLine === false);
}
