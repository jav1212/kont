/** Describes a failed IVA request with its HTTP status for field or page feedback. */
export class IvaClientError extends Error {
  /**
   * Creates a normalized HTTP error.
   * @param message - Spanish message returned by the server or a fallback.
   * @param status - HTTP response status code.
   */
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "IvaClientError";
  }
}

/**
 * Sends a typed request to the IVA API and unwraps its standard `{ data }` envelope.
 * @param input - Relative IVA endpoint path and optional request settings.
 * @returns Parsed response data.
 * @throws {IvaClientError} When the server rejects the request or returns invalid JSON.
 */
export async function ivaRequest<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new IvaClientError("La respuesta del servicio IVA no es válida.", response.status); }
  if (!response.ok) {
    const message = typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
      ? payload.error : "No fue posible completar la solicitud IVA.";
    throw new IvaClientError(message, response.status);
  }
  if (typeof payload !== "object" || payload === null || !("data" in payload)) {
    throw new IvaClientError("La respuesta del servicio IVA no tiene el formato esperado.", response.status);
  }
  return payload.data as T;
}
