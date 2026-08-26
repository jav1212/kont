/** Metadata describing a user-visible state change recorded in history. */
export interface HistoryAction {
  /** Human-readable action description suitable for undo and redo affordances. */
  readonly label: string;
  /** Optional semantic key used to coalesce consecutive edits. */
  readonly groupKey?: string;
  /** Monotonic timestamp in milliseconds used only for coalescing decisions. */
  readonly occurredAt: number;
}

/** Immutable memento paired with the action that produced the next state. */
export interface HistoryEntry<T> {
  /** Snapshot that must be restored when the action is undone or redone. */
  readonly snapshot: T;
  /** Metadata describing the transition associated with the snapshot. */
  readonly action: HistoryAction;
}

/** Immutable undo and redo stacks for a snapshot type. */
export interface HistoryState<T> {
  /** Entries available to undo, ordered from oldest to newest. */
  readonly past: readonly HistoryEntry<T>[];
  /** Entries available to redo, ordered from next to last. */
  readonly future: readonly HistoryEntry<T>[];
}

/** Result of applying an undo or redo transition. */
export interface HistoryTransition<T> {
  /** Updated history stacks after the transition. */
  readonly history: HistoryState<T>;
  /** Snapshot that the caller must restore. */
  readonly snapshot: T;
  /** Action associated with the restored snapshot. */
  readonly action: HistoryAction;
}

/** Optional retention and edit-coalescing policy for history recording. */
export interface RecordHistoryOptions {
  /** Maximum retained undo entries; values below one are normalized to one. */
  readonly limit?: number;
  /** Maximum interval for coalescing equal group keys; negative values become zero. */
  readonly coalesceWithinMs?: number;
}

/**
 * Creates an empty immutable history state.
 * @returns A history with no undo or redo entries.
 */
export function emptyHistory<T>(): HistoryState<T> {
  return { past: [], future: [] };
}

/**
 * Records the memento that precedes a new state and invalidates the redo branch.
 * Consecutive actions with the same group key preserve the earliest memento.
 * @param history - Current immutable history state.
 * @param snapshot - State to restore if the new action is undone.
 * @param action - Metadata for the state change being recorded.
 * @param options - Optional retention and coalescing policy.
 * @returns A new immutable history state.
 */
export function recordHistory<T>(
  history: HistoryState<T>,
  snapshot: T,
  action: HistoryAction,
  options: RecordHistoryOptions = {},
): HistoryState<T> {
  const limit = Math.max(1, options.limit ?? 100);
  const coalesceWithinMs = Math.max(0, options.coalesceWithinMs ?? 800);
  const previous = history.past.at(-1);
  const coalesces = Boolean(
    action.groupKey &&
    previous?.action.groupKey === action.groupKey &&
    action.occurredAt - previous.action.occurredAt <= coalesceWithinMs,
  );

  if (coalesces && previous) {
    return {
      past: [...history.past.slice(0, -1), { snapshot: previous.snapshot, action }],
      future: [],
    };
  }

  return {
    past: [...history.past, { snapshot, action }].slice(-limit),
    future: [],
  };
}

/**
 * Moves the newest undo entry to the redo stack.
 * @param history - Current immutable history state.
 * @param current - Current snapshot to preserve for a possible redo.
 * @returns The transition to apply, or `null` when no undo entry exists.
 */
export function undoHistory<T>(history: HistoryState<T>, current: T): HistoryTransition<T> | null {
  const entry = history.past.at(-1);
  if (!entry) return null;

  return {
    snapshot: entry.snapshot,
    action: entry.action,
    history: {
      past: history.past.slice(0, -1),
      future: [{ snapshot: current, action: entry.action }, ...history.future],
    },
  };
}

/**
 * Moves the next redo entry back to the undo stack.
 * @param history - Current immutable history state.
 * @param current - Current snapshot to preserve for a possible undo.
 * @returns The transition to apply, or `null` when no redo entry exists.
 */
export function redoHistory<T>(history: HistoryState<T>, current: T): HistoryTransition<T> | null {
  const entry = history.future[0];
  if (!entry) return null;

  return {
    snapshot: entry.snapshot,
    action: entry.action,
    history: {
      past: [...history.past, { snapshot: current, action: entry.action }],
      future: history.future.slice(1),
    },
  };
}
