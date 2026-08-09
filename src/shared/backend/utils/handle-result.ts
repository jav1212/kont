// Shared HTTP response adapter for Result<T>.
// Role: infrastructure/interfaces boundary — converts domain results to Next.js Response objects.
// Invariant: failure always maps to 400; callers may override the success status code.

import { Result } from "@/src/core/domain/result";
import { errorResponseBody, logAndGetCode } from "@/src/shared/backend/errors/system-error";

export async function handleResult<T>(result: Result<T>, successStatus: number = 200, request?: Request): Promise<Response> {
    if (result.isFailure) {
        const error = result.getError();
        const code = await logAndGetCode(error, {
            source: "api",
            route: request ? new URL(request.url).pathname : undefined,
            method: request?.method,
            statusCode: 400,
        });
        return Response.json(errorResponseBody(error, code), { status: 400 });
    }
    return Response.json({ data: result.getValue() }, { status: successStatus });
}
