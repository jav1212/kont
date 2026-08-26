/** Opaque identifier assigned to one interaction block lease. */
export type InteractionBlockToken = string;
/** Business cause that requires globally blocking client interaction. */
export type InteractionBlockKind =
  | "startup"
  | "connectivity"
  | "exclusive_operation"
  | "maintenance"
  | "security"
  | "unexpected_failure";
/** Lifecycle state presented for an active interaction block. */
export type InteractionBlockState = "working" | "waiting" | "failed";
/** Action a user may invoke while interaction is blocked. */
export type InteractionBlockActionKind = "retry" | "cancel" | "exit";
/** Stable classifications for expected interaction-gate failures. */
export type ClientInteractionFailureCode =
  | "CLIENT_INTERACTION_INVALID"
  | "CLIENT_INTERACTION_DUPLICATE_TOKEN"
  | "CLIENT_INTERACTION_RELEASED";

/** Expected typed failure produced by the global interaction capability. */
export class ClientInteractionFailure extends Error {
  /**
   * Creates an interaction failure with a stable public code.
   * @param code - Machine-readable failure classification.
   * @param message - Diagnostic description for trusted callers.
   */
  constructor(readonly code: ClientInteractionFailureCode, message: string) {
    super(message);
    this.name = "ClientInteractionFailure";
  }
}

/** Progress representation for an interaction block. */
export type InteractionProgress =
  | { readonly kind: "indeterminate" }
  | { readonly kind: "determinate"; readonly value: number };

/** User action presented by an interaction boundary. */
export interface InteractionBlockAction {
  readonly kind: InteractionBlockActionKind;
  readonly label: string;
}

/** Immutable normalized cause currently blocking client interaction. */
export interface InteractionBlock {
  readonly token: InteractionBlockToken;
  readonly kind: InteractionBlockKind;
  readonly state: InteractionBlockState;
  readonly priority: number;
  readonly message: string;
  readonly description: string | null;
  readonly progress: InteractionProgress;
  readonly referenceCode: string | null;
  readonly actions: readonly InteractionBlockAction[];
}

/** Input accepted when acquiring a new interaction block. */
export type InteractionBlockInput = Omit<InteractionBlock, "token" | "description" | "progress" | "referenceCode" | "actions"> & {
  readonly description?: string | null;
  readonly progress?: InteractionProgress;
  readonly referenceCode?: string | null;
  readonly actions?: readonly InteractionBlockAction[];
};

/** Mutable fields accepted while updating an active interaction lease. */
export type InteractionBlockUpdate = Partial<Omit<InteractionBlockInput, "kind">>;

/** Immutable observable state of the global interaction gate. */
export type GlobalInteractionSnapshot =
  | { readonly status: "available"; readonly activeBlock: null; readonly blocks: readonly InteractionBlock[] }
  | { readonly status: "blocked"; readonly activeBlock: InteractionBlock; readonly blocks: readonly InteractionBlock[] };

/** Factory that produces unique interaction block tokens. */
export type InteractionBlockTokenFactory = () => InteractionBlockToken;
/** Listener invoked after the global interaction snapshot changes. */
export type GlobalInteractionListener = () => void;

/** Handle that owns the update and release lifecycle of one interaction block. */
export interface InteractionBlockLease {
  readonly token: InteractionBlockToken;
  readonly active: boolean;
  /**
   * Replaces selected presentation and state fields on the active block.
   * @param update - Partial state to merge into the current block.
   * @returns Nothing.
   * @throws {ClientInteractionFailure} When the lease was released or the update is invalid.
   */
  update(update: InteractionBlockUpdate): void;
  /**
   * Releases the interaction block idempotently.
   * @returns Nothing.
   */
  release(): void;
}

interface StoredBlock {
  readonly sequence: number;
  readonly block: InteractionBlock;
}

const AVAILABLE_SNAPSHOT: GlobalInteractionSnapshot = Object.freeze({
  status: "available",
  activeBlock: null,
  blocks: Object.freeze([]),
});

/** Coordinates overlapping global interaction blocks with stable priority ordering. */
export class GlobalInteractionGate {
  private readonly listeners = new Set<GlobalInteractionListener>();
  private readonly storedBlocks = new Map<InteractionBlockToken, StoredBlock>();
  private readonly issuedTokens = new Set<InteractionBlockToken>();
  private sequence = 0;
  private snapshot: GlobalInteractionSnapshot = AVAILABLE_SNAPSHOT;

  /**
   * Creates an empty interaction gate.
   * @param createToken - Factory that must return a unique token for every acquired lease.
   */
  constructor(private readonly createToken: InteractionBlockTokenFactory = () => `interaction-block-${this.sequence + 1}`) {}

  /**
   * Returns the current immutable snapshot.
   * @returns The same snapshot reference until a lease changes.
   */
  getSnapshot = (): GlobalInteractionSnapshot => this.snapshot;

  /**
   * Subscribes to gate state changes.
   * @param listener - Callback invoked synchronously after each published change.
   * @returns An idempotent function that removes the subscription.
   */
  subscribe = (listener: GlobalInteractionListener): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /**
   * Acquires a new global interaction block.
   * @param input - Cause, priority, state, and portable presentation metadata.
   * @returns A lease that exclusively owns updates and release for the block.
   * @throws {ClientInteractionFailure} When the input is invalid or the token was previously issued.
   */
  acquire(input: InteractionBlockInput): InteractionBlockLease {
    const token = requiredText(this.createToken(), 200, "Interaction block token");
    if (this.issuedTokens.has(token)) {
      throw new ClientInteractionFailure("CLIENT_INTERACTION_DUPLICATE_TOKEN", "Interaction block token was already issued by this gate.");
    }

    const normalized = normalizeBlock(token, input);
    const sequence = ++this.sequence;
    this.issuedTokens.add(token);
    this.storedBlocks.set(token, { sequence, block: normalized });
    this.publish();

    let active = true;
    return {
      token,
      get active() { return active; },
      update: (update) => {
        if (!active) {
          throw new ClientInteractionFailure("CLIENT_INTERACTION_RELEASED", "A released interaction block cannot be updated.");
        }
        const stored = this.storedBlocks.get(token);
        if (!stored) {
          throw new ClientInteractionFailure("CLIENT_INTERACTION_RELEASED", "A released interaction block cannot be updated.");
        }
        const current = stored.block;
        this.storedBlocks.set(token, {
          sequence: stored.sequence,
          block: normalizeBlock(token, {
            kind: current.kind,
            state: update.state ?? current.state,
            priority: update.priority ?? current.priority,
            message: update.message ?? current.message,
            description: update.description === undefined ? current.description : update.description,
            progress: update.progress ?? current.progress,
            referenceCode: update.referenceCode === undefined ? current.referenceCode : update.referenceCode,
            actions: update.actions ?? current.actions,
          }),
        });
        this.publish();
      },
      release: () => {
        if (!active) return;
        active = false;
        this.storedBlocks.delete(token);
        this.publish();
      },
    };
  }

  private publish(): void {
    const stored = [...this.storedBlocks.values()].sort(compareStoredBlocks);
    if (stored.length === 0) {
      this.snapshot = AVAILABLE_SNAPSHOT;
    } else {
      const blocks = Object.freeze(stored.map(({ block }) => block));
      this.snapshot = Object.freeze({ status: "blocked", activeBlock: blocks[0]!, blocks });
    }
    for (const listener of [...this.listeners]) listener();
  }
}

function normalizeBlock(token: InteractionBlockToken, input: InteractionBlockInput): InteractionBlock {
  return Object.freeze({
    token,
    kind: input.kind,
    state: input.state,
    priority: finiteNumber(input.priority, "Interaction block priority"),
    message: requiredText(input.message, 1_000, "Interaction block message"),
    description: optionalText(input.description, 2_000, "Interaction block description"),
    progress: normalizeProgress(input.progress),
    referenceCode: optionalText(input.referenceCode, 128, "Interaction block reference code"),
    actions: normalizeActions(input.actions),
  });
}

function normalizeProgress(progress: InteractionProgress | undefined): InteractionProgress {
  if (!progress || progress.kind === "indeterminate") return Object.freeze({ kind: "indeterminate" });
  if (!Number.isFinite(progress.value) || progress.value < 0 || progress.value > 1) {
    throw new ClientInteractionFailure("CLIENT_INTERACTION_INVALID", "Determinate progress must be between zero and one.");
  }
  return Object.freeze({ kind: "determinate", value: progress.value });
}

function normalizeActions(actions: readonly InteractionBlockAction[] | undefined): readonly InteractionBlockAction[] {
  const normalized = (actions ?? []).map((action) => Object.freeze({
    kind: action.kind,
    label: requiredText(action.label, 100, "Interaction block action label"),
  }));
  const kinds = new Set(normalized.map(({ kind }) => kind));
  if (kinds.size !== normalized.length) {
    throw new ClientInteractionFailure("CLIENT_INTERACTION_INVALID", "Interaction block actions must have unique kinds.");
  }
  return Object.freeze(normalized);
}

function compareStoredBlocks(left: StoredBlock, right: StoredBlock): number {
  return right.block.priority - left.block.priority || left.sequence - right.sequence;
}

function finiteNumber(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new ClientInteractionFailure("CLIENT_INTERACTION_INVALID", `${label} is invalid.`);
  return value;
}

function requiredText(value: string, maximumLength: number, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength) {
    throw new ClientInteractionFailure("CLIENT_INTERACTION_INVALID", `${label} is invalid.`);
  }
  return normalized;
}

function optionalText(value: string | null | undefined, maximumLength: number, label: string): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maximumLength) {
    throw new ClientInteractionFailure("CLIENT_INTERACTION_INVALID", `${label} is invalid.`);
  }
  return normalized;
}
