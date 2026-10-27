// Typed failure for Kontave API responses. Throw it instead of a plain `Error`
// when `response.ok` is false so the feedback policy can tell a rejected
// request (4xx, expected) from a server failure (5xx) and reuse the incident
// code the backend already recorded.

const REQUEST_ID_HEADER = "x-request-id";

/** HTTP failure returned by a Kontave API route, carrying the data the Web feedback policy classifies. */
export class ApiRequestFailure extends Error {
    readonly status: number;
    /** Code from the standard `{ error, errorCode }` envelope; a `KNT-…` value is an incident already recorded by the server. */
    readonly errorCode: string | null;
    readonly requestId: string | null;

    /**
     * Captures a failed API response.
     * @param response - Failed response; only its status and headers are read, so the body may already be consumed.
     * @param message - Public Spanish message from the server envelope or a safe fallback.
     * @param body - Parsed response body, used to recover `errorCode` from the standard envelope.
     */
    constructor(response: Pick<Response, "status" | "headers">, message: string, body?: unknown) {
        super(message);
        this.name = "ApiRequestFailure";
        this.status = response.status;
        this.errorCode = readErrorCode(body);
        this.requestId = response.headers.get(REQUEST_ID_HEADER);
    }
}

function readErrorCode(body: unknown): string | null {
    if (typeof body !== "object" || body === null || !("errorCode" in body)) return null;
    const code = (body as { errorCode?: unknown }).errorCode;
    return typeof code === "string" && code.trim() ? code.trim() : null;
}
