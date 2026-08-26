export type InteractionBlockToken = string;
export type InteractionBlockKind =
  | "startup"
  | "connectivity"
  | "exclusive_operation"
  | "maintenance"
  | "security"
  | "unexpected_failure";
export type InteractionBlockState = "working" | "waiting" | "failed";
export type InteractionBlockActionKind = "retry" | "cancel" | "exit";
export type ClientInteractionFailureCode =
  | "CLIENT_INTERACTION_INVALID"
  | "CLIENT_INTERACTION_DUPLICATE_TOKEN"
  | "CLIENT_INTERACTION_RELEASED";

export class ClientInteractionFailure extends Error {
  constructor(readonly code: ClientInteractionFailureCode, message: string) {
    super(message);
    this.name = "ClientInteractionFailure";
  }
}

export type InteractionProgress =
  | { readonly kind: "indeterminate" }
  | { readonly kind: "determinate"; readonly value: number };

export interface InteractionBlockAction {
  readonly kind: InteractionBlockActionKind;
  readonly label: string;
}

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

export type InteractionBlockInput = Omit<InteractionBlock, "token" | "description" | "progress" | "referenceCode" | "actions"> & {
  readonly description?: string | null;
  readonly progress?: InteractionProgress;
  readonly referenceCode?: string | null;
  readonly actions?: readonly InteractionBlockAction[];
};

export type InteractionBlockUpdate = Partial<Omit<InteractionBlockInput, "kind">>;

export type GlobalInteractionSnapshot =
  | { readonly status: "available"; readonly activeBlock: null; readonly blocks: readonly InteractionBlock[] }
  | { readonly status: "blocked"; readonly activeBlock: InteractionBlock; readonly blocks: readonly InteractionBlock[] };

export type InteractionBlockTokenFactory = () => InteractionBlockToken;
export type GlobalInteractionListener = () => void;

export interface InteractionBlockLease {
  readonly token: InteractionBlockToken;
  readonly active: boolean;
  update(update: InteractionBlockUpdate): void;
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

export class GlobalInteractionGate {
  private readonly listeners = new Set<GlobalInteractionListener>();
  private readonly storedBlocks = new Map<InteractionBlockToken, StoredBlock>();
  private readonly issuedTokens = new Set<InteractionBlockToken>();
  private sequence = 0;
  private snapshot: GlobalInteractionSnapshot = AVAILABLE_SNAPSHOT;

  constructor(private readonly createToken: InteractionBlockTokenFactory = () => `interaction-block-${this.sequence + 1}`) {}

  getSnapshot = (): GlobalInteractionSnapshot => this.snapshot;

  subscribe = (listener: GlobalInteractionListener): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

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
