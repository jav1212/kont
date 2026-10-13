/** A fetch signal with caller cancellation and a bounded request lifetime. */
export interface RequestCancellation {
  /** Signal passed to the platform request implementation. */
  readonly signal: AbortSignal;
  /** Releases resources associated with the request cancellation signal.
   * @returns Nothing.
   */
  dispose(): void;
}

/** Combines caller cancellation with a timeout using broadly supported browser APIs.
 * @param source - Signal that cancels work when its owning operation becomes obsolete.
 * @param timeoutMs - Maximum request duration in milliseconds; must be finite and positive.
 * @returns A signal for the request and a cleanup function for its resources.
 * @throws {RangeError} When timeoutMs is not finite and positive.
 */
export function createRequestCancellation(
  source: AbortSignal,
  timeoutMs: number,
): RequestCancellation {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new RangeError("Request timeout must be a finite positive number.");

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const cancelFromSource = () => controller.abort(source.reason);
  if (source.aborted) cancelFromSource();
  else {
    source.addEventListener("abort", cancelFromSource, { once: true });
    timer = setTimeout(
      () =>
        controller.abort(
          new DOMException("The operation timed out.", "TimeoutError"),
        ),
      timeoutMs,
    );
  }

  return {
    signal: controller.signal,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      source.removeEventListener("abort", cancelFromSource);
    },
  };
}
