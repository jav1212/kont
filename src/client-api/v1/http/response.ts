import type {
  ApiError,
  ApiErrorCode,
  ApiSuccess,
} from "@kontave/client-contracts";

export function apiSuccess<T>(
  data: T,
  requestId: string,
  init?: ResponseInit,
): Response {
  const body: ApiSuccess<T> = { data, meta: { requestId } };
  return Response.json(body, {
    ...init,
    headers: responseHeaders(requestId, init?.headers),
  });
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  requestId: string,
  status: number,
): Response {
  const body: ApiError = { error: { code, message, requestId } };
  return Response.json(body, { status, headers: responseHeaders(requestId) });
}

function responseHeaders(requestId: string, initial?: HeadersInit): Headers {
  const headers = new Headers(initial);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Request-Id", requestId);
  return headers;
}
