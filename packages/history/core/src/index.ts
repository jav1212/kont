export interface HistoryAction {
  readonly label: string;
  readonly groupKey?: string;
  readonly occurredAt: number;
}

export interface HistoryEntry<T> {
  readonly snapshot: T;
  readonly action: HistoryAction;
}

export interface HistoryState<T> {
  readonly past: readonly HistoryEntry<T>[];
  readonly future: readonly HistoryEntry<T>[];
}

export interface HistoryTransition<T> {
  readonly history: HistoryState<T>;
  readonly snapshot: T;
  readonly action: HistoryAction;
}

export interface RecordHistoryOptions {
  readonly limit?: number;
  readonly coalesceWithinMs?: number;
}

export function emptyHistory<T>(): HistoryState<T> {
  return { past: [], future: [] };
}

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
