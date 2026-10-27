// Recovery for stale clients after a deploy.
//
// A tab opened before a deploy still references the previous build's chunk
// hashes; once they are gone, navigation fails with ChunkLoadError. A single
// full reload fetches the new build and fixes it, so that is not an incident.
// If the error comes back right after the reload, something else is broken and
// callers report it as usual.

const RELOAD_KEY = "kontave.chunk-reload-at";
const RELOAD_WINDOW_MS = 60_000;

const CHUNK_FAILURE = /Loading (?:CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

/**
 * Tells whether a failure comes from loading a code-split chunk of the current build.
 * @param error - Thrown value, rejection reason, or boundary error.
 * @returns `true` for webpack/Turbopack chunk failures and failed dynamic imports.
 */
export function isChunkLoadError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return error.name === "ChunkLoadError" || CHUNK_FAILURE.test(error.message);
}

/**
 * Reloads the page once to pick up the current build when a chunk failed to load.
 * The guard lives in sessionStorage so a broken deploy cannot cause a reload loop.
 * @param error - Failure observed by a boundary or a global listener.
 * @returns `true` when a reload was started and the caller should not report; `false` otherwise.
 */
export function recoverFromChunkLoadError(error: unknown): boolean {
    if (typeof window === "undefined" || !isChunkLoadError(error)) return false;
    try {
        const previous = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
        if (Date.now() - previous < RELOAD_WINDOW_MS) return false;
        window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
        // Without storage there is no loop guard; report instead of risking repeated reloads.
        return false;
    }
    window.location.reload();
    return true;
}
