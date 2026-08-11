import type { NativeApiError, NativeApiErrorCode, NativeApiSuccess } from "@kontave/native-api-contracts";

export function nativeSuccess<T>(data: T, requestId: string, init?: ResponseInit): Response {
  const body: NativeApiSuccess<T> = { data, meta: { requestId } };
  return Response.json(body, { ...init, headers: responseHeaders(requestId, init?.headers) });
}

export function nativeError(
  code: NativeApiErrorCode,
  message: string,
  requestId: string,
  status: number,
): Response {
  const body: NativeApiError = { error: { code, message, requestId } };
  return Response.json(body, { status, headers: responseHeaders(requestId) });
}

function responseHeaders(requestId: string, initial?: HeadersInit): Headers {
  const headers = new Headers(initial);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Request-Id", requestId);
  return headers;
}
