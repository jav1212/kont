// Shared HTTP response adapter for Result<T>.
// Role: infrastructure/interfaces boundary — converts domain results to Next.js Response objects.
// Invariant: failure always maps to 400; callers may override the success status code.

import { Result } from "@/src/core/domain/result";

export function handleResult<T>(result: Result<T>, successStatus: number = 200): Response {
    if (result.isFailure) {
        return Response.json({ error: result.getError() }, { status: 400 });
    }
    return Response.json({ data: result.getValue() }, { status: successStatus });
}
