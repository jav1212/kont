export type FeedbackIntent = "success" | "error" | "warning" | "info" | "loading";
export type FeedbackHandle = string;
export type ClientFeedbackFailureCode = "CLIENT_FEEDBACK_INVALID";

/**
 * How long a presentation stays visible.
 * `transient` may auto-dismiss; `sticky` stays until the user or the application dismisses it,
 * so users have time to read and copy incident references (WCAG 2.2.1).
 */
export type FeedbackPersistence = "transient" | "sticky";

export class ClientFeedbackFailure extends Error {
  /**
   * Creates a typed expected failure for invalid portable feedback data.
   * @param code - Stable machine-readable failure code.
   * @param message - Human-readable diagnostic message.
   */
  constructor(readonly code: ClientFeedbackFailureCode, message: string) {
    super(message);
    this.name = "ClientFeedbackFailure";
  }
}

/** User-triggered follow-up such as retry or undo. Presenters own the visual control. */
export interface FeedbackAction {
  readonly label: string;
  /**
   * Runs the follow-up requested by the user.
   * @returns Nothing, or a promise the presenter does not await for dismissal.
   */
  perform(): void | Promise<void>;
}

export interface ClientFeedback {
  readonly intent: FeedbackIntent;
  readonly message: string;
  readonly description: string | null;
  /**
   * Stable code the user can copy for support. Presenters render it themselves so public copy
   * and its localization stay in the presentation layer.
   */
  readonly referenceCode: string | null;
  readonly deduplicationKey: string | null;
  readonly persistence: FeedbackPersistence;
  /** Exact visible time for transient feedback, e.g. an undo window; `null` uses the platform default. */
  readonly autoDismissMs: number | null;
  readonly action: FeedbackAction | null;
}

export interface FeedbackPresenter {
  /**
   * Presents feedback through the current client surface.
   * A presentation with the same `deduplicationKey` as a visible one must replace it instead of stacking.
   * @param feedback - Validated portable feedback.
   * @returns An opaque handle that can later dismiss the presentation.
   */
  present(feedback: ClientFeedback): FeedbackHandle;

  /**
   * Dismisses feedback previously presented by this presenter.
   * @param handle - Opaque handle returned by `present`.
   * @returns Nothing after forwarding the dismissal request.
   */
  dismiss(handle: FeedbackHandle): void;
}

export interface UnexpectedFailureReport {
  readonly eventName: string;
  readonly error: unknown;
  readonly publicMessage: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
  /** Server request identifier, when the failure happened while handling a request. */
  readonly requestId?: string;
  /** Low-cardinality grouping key; reporters may use it to deduplicate repeated reports. */
  readonly fingerprint?: string;
  /** Client route or screen where the failure surfaced. */
  readonly route?: string;
}

export interface IncidentReference {
  readonly code: string;
  readonly recorded: boolean;
}

export interface IncidentReporter {
  /**
   * Records an unexpected failure without exposing infrastructure details to presentation code.
   * @param failure - Portable incident report and diagnostic payload.
   * @returns A stable incident reference when recording completes.
   * @throws {Error} When the backing incident service cannot record the report.
   */
  report(failure: UnexpectedFailureReport): Promise<IncidentReference>;
}

/** Failure the user can understand or correct; it never becomes an incident. */
export interface ExpectedFailure {
  readonly kind: "expected";
  /** Stable domain code shown as a copyable reference, or `null` when the message is self-sufficient. */
  readonly code: string | null;
  readonly message: string;
}

/** Failure whose incident another tier (usually the backend) already recorded; it must not be reported twice. */
export interface ReportedFailure {
  readonly kind: "reported";
  readonly referenceCode: string;
  readonly message: string;
}

export type ClassifiedFailure = ExpectedFailure | ReportedFailure;

export interface FailureClassifier {
  /**
   * Recognizes failures that are part of the client's expected catalog or were already recorded elsewhere.
   * @param error - Value thrown or returned by an operation.
   * @returns The classification, or `null` when the failure is unexpected and must be reported.
   */
  classify(error: unknown): ClassifiedFailure | null;
}

export interface UnexpectedFailureResolution {
  readonly feedback: ClientFeedback;
  readonly incident: IncidentReference | null;
}

export type ClientFeedbackInput = Pick<ClientFeedback, "intent" | "message"> & {
  readonly description?: string | null;
  readonly referenceCode?: string | null;
  readonly deduplicationKey?: string | null;
  readonly persistence?: FeedbackPersistence;
  readonly autoDismissMs?: number | null;
  readonly action?: FeedbackAction | null;
};

type FeedbackOptions = Omit<ClientFeedbackInput, "intent" | "message">;

/**
 * Validates and normalizes portable feedback before it reaches a platform presenter.
 * Loading feedback defaults to `sticky` because it lives until its operation settles; everything
 * else defaults to `transient` unless the caller asks otherwise.
 * @param input - Feedback intent, public copy, reference, deduplication, persistence, and action.
 * @returns A normalized immutable feedback value.
 * @throws {ClientFeedbackFailure} When required text is empty, a field exceeds its public limit, or the
 * auto-dismiss time is not a positive finite number on transient feedback.
 */
export function clientFeedback(input: ClientFeedbackInput): ClientFeedback {
  const action = input.action ?? null;
  const persistence = input.persistence ?? (input.intent === "loading" ? "sticky" : "transient");
  return Object.freeze({
    intent: input.intent,
    message: requiredText(input.message, 1_000, "Feedback message"),
    description: optionalText(input.description, 2_000, "Feedback description"),
    referenceCode: optionalText(input.referenceCode, 128, "Feedback reference code"),
    deduplicationKey: optionalText(input.deduplicationKey, 200, "Feedback deduplication key"),
    persistence,
    autoDismissMs: autoDismiss(input.autoDismissMs, persistence),
    action: action === null ? null : Object.freeze({
      label: requiredText(action.label, 60, "Feedback action label"),
      perform: () => action.perform(),
    }),
  });
}

/**
 * Creates validated success feedback.
 * @param message - Public success message.
 * @param input - Optional description, reference, deduplication, persistence, and action.
 * @returns Portable success feedback.
 * @throws {ClientFeedbackFailure} When any text field is invalid.
 */
export function successFeedback(message: string, input: FeedbackOptions = {}): ClientFeedback {
  return clientFeedback({ ...input, intent: "success", message });
}

/**
 * Creates validated error feedback.
 * @param message - Public error message.
 * @param input - Optional description, reference, deduplication, persistence, and action.
 * @returns Portable error feedback.
 * @throws {ClientFeedbackFailure} When any text field is invalid.
 */
export function errorFeedback(message: string, input: FeedbackOptions = {}): ClientFeedback {
  return clientFeedback({ ...input, intent: "error", message });
}

/**
 * Creates error feedback for an expected failure whose stable domain code is also its default deduplication key.
 * @param input - Stable code, public message, optional deduplication override, and optional action.
 * @returns Portable coded error feedback.
 * @throws {ClientFeedbackFailure} When the code or message is invalid.
 */
export function codedErrorFeedback(input: {
  readonly code: string;
  readonly message: string;
  readonly deduplicationKey?: string | null;
  readonly action?: FeedbackAction | null;
}): ClientFeedback {
  const referenceCode = requiredText(input.code, 128, "Error code");
  return errorFeedback(input.message, {
    referenceCode,
    deduplicationKey: input.deduplicationKey ?? referenceCode,
    action: input.action ?? null,
  });
}

/**
 * Creates validated warning feedback.
 * @param message - Public warning message.
 * @param input - Optional description, reference, deduplication, persistence, and action.
 * @returns Portable warning feedback.
 * @throws {ClientFeedbackFailure} When any text field is invalid.
 */
export function warningFeedback(message: string, input: FeedbackOptions = {}): ClientFeedback {
  return clientFeedback({ ...input, intent: "warning", message });
}

/**
 * Creates validated informational feedback.
 * @param message - Public informational message.
 * @param input - Optional description, reference, deduplication, persistence, and action.
 * @returns Portable informational feedback.
 * @throws {ClientFeedbackFailure} When any text field is invalid.
 */
export function infoFeedback(message: string, input: FeedbackOptions = {}): ClientFeedback {
  return clientFeedback({ ...input, intent: "info", message });
}

/**
 * Creates validated progress feedback for an operation that has not settled yet.
 * @param message - Public progress message.
 * @param input - Optional description and deduplication metadata.
 * @returns Portable sticky loading feedback.
 * @throws {ClientFeedbackFailure} When any text field is invalid.
 */
export function loadingFeedback(message: string, input: Pick<FeedbackOptions, "description" | "deduplicationKey"> = {}): ClientFeedback {
  return clientFeedback({ ...input, intent: "loading", message });
}

/**
 * Creates feedback for a backend failure whose incident has already been recorded.
 * It is sticky so the user can copy the reference before it disappears.
 * @param input - Public message, incident reference, and optional deduplication override.
 * @returns Portable error feedback without reporting a second incident.
 * @throws {ClientFeedbackFailure} When the message or reference is invalid.
 */
export function reportedFailureFeedback(input: {
  readonly message: string;
  readonly referenceCode: string;
  readonly deduplicationKey?: string | null;
}): ClientFeedback {
  const referenceCode = requiredText(input.referenceCode, 128, "Incident reference code");
  return errorFeedback(input.message, {
    referenceCode,
    deduplicationKey: input.deduplicationKey ?? referenceCode,
    persistence: "sticky",
  });
}

export interface TrackedOperationMessages<T> {
  readonly loading: string;
  readonly success: string | ((value: T) => string);
  /**
   * Builds the failure presentation, usually through {@link ResolveFailure}.
   * @param error - Rejection reason of the tracked operation.
   * @returns Feedback presented in place of the loading state.
   */
  readonly failure: (error: unknown) => ClientFeedback | Promise<ClientFeedback>;
}

export class PresentFeedback {
  /**
   * Creates the feedback presentation use case with an explicit platform port.
   * @param presenter - Presenter adapter for the current client surface.
   */
  constructor(private readonly presenter: FeedbackPresenter) {}

  /**
   * Revalidates and presents portable feedback.
   * @param feedback - Feedback requested by application or domain handling.
   * @returns The presenter's opaque dismissal handle.
   * @throws {ClientFeedbackFailure} When the feedback payload is invalid.
   */
  execute(feedback: ClientFeedback): FeedbackHandle {
    return this.presenter.present(clientFeedback(feedback));
  }

  /**
   * Dismisses an existing feedback presentation.
   * @param handle - Non-empty presenter handle.
   * @returns Nothing after forwarding the dismissal.
   * @throws {ClientFeedbackFailure} When the handle is empty.
   */
  dismiss(handle: FeedbackHandle): void {
    const normalized = handle.trim();
    if (!normalized) throw new ClientFeedbackFailure("CLIENT_FEEDBACK_INVALID", "Feedback handle is required.");
    this.presenter.dismiss(normalized);
  }

  /**
   * Shows progress while an operation runs, then replaces it with its success or failure feedback.
   * @param operation - Operation already started by the caller.
   * @param messages - Loading copy, success copy, and failure feedback factory.
   * @returns The operation value once it fulfills.
   * @throws The original rejection reason after its failure feedback has been presented.
   * @throws {ClientFeedbackFailure} When the loading or success copy is invalid.
   */
  async track<T>(operation: Promise<T>, messages: TrackedOperationMessages<T>): Promise<T> {
    const loading = this.execute(loadingFeedback(messages.loading));
    try {
      const value = await operation;
      this.dismiss(loading);
      this.execute(successFeedback(typeof messages.success === "function" ? messages.success(value) : messages.success));
      return value;
    } catch (error) {
      this.dismiss(loading);
      this.execute(await messages.failure(error));
      throw error;
    }
  }
}

export interface ResolveUnexpectedFailureOptions {
  /** Upper bound for the reporter round trip; the user never waits longer than this for feedback. */
  readonly reportTimeoutMs?: number;
}

const DEFAULT_REPORT_TIMEOUT_MS = 4_000;

export class ResolveUnexpectedFailure {
  private readonly reportTimeoutMs: number;

  /**
   * Creates the unexpected-failure resolver with an explicit incident-reporting port.
   * @param incidents - Incident reporter used before exposing a public reference.
   * @param options - Optional reporter timeout; defaults to four seconds.
   * @throws {ClientFeedbackFailure} When the timeout is not a positive finite number.
   */
  constructor(private readonly incidents: IncidentReporter, options: ResolveUnexpectedFailureOptions = {}) {
    const timeout = options.reportTimeoutMs ?? DEFAULT_REPORT_TIMEOUT_MS;
    if (!Number.isFinite(timeout) || timeout <= 0) {
      throw new ClientFeedbackFailure("CLIENT_FEEDBACK_INVALID", "Report timeout must be a positive number.");
    }
    this.reportTimeoutMs = timeout;
  }

  /**
   * Attempts to report an unexpected failure and always returns safe public feedback.
   * Reporter failures and timeouts are deliberately absorbed so they never mask the original operation failure.
   * @param report - Unexpected failure details and safe public message.
   * @returns Sticky feedback with an incident reference when reporting succeeds, otherwise unreferenced feedback.
   * @throws {ClientFeedbackFailure} When the public message is invalid.
   */
  async execute(report: UnexpectedFailureReport): Promise<UnexpectedFailureResolution> {
    const publicMessage = requiredText(report.publicMessage, 1_000, "Unexpected failure public message");
    try {
      const incident = await withTimeout(this.incidents.report({ ...report, publicMessage }), this.reportTimeoutMs);
      const referenceCode = requiredText(incident.code, 128, "Incident reference code");
      return {
        incident: { ...incident, code: referenceCode },
        feedback: errorFeedback(publicMessage, {
          referenceCode,
          deduplicationKey: report.fingerprint ?? referenceCode,
          persistence: "sticky",
        }),
      };
    } catch {
      return {
        incident: null,
        feedback: errorFeedback(publicMessage, { deduplicationKey: report.fingerprint ?? null }),
      };
    }
  }
}

export interface ResolveFailureCommand extends UnexpectedFailureReport {}

export class ResolveFailure {
  /**
   * Creates the single entry point that separates expected failures from incidents.
   * @param classifier - Client policy that recognizes expected failures.
   * @param unexpected - Resolver used when the classifier does not recognize the failure.
   */
  constructor(
    private readonly classifier: FailureClassifier,
    private readonly unexpected: ResolveUnexpectedFailure,
  ) {}

  /**
   * Turns any failure into presentable feedback, reporting an incident only when nobody recorded it yet.
   * A classifier that throws is treated as not recognizing the failure.
   * @param command - Failure plus the public message and diagnostics used if it turns out to be unexpected.
   * @returns Expected feedback without an incident, reported feedback with the existing reference, or the
   * unexpected-failure resolution.
   * @throws {ClientFeedbackFailure} When the classified copy or the public message is invalid.
   */
  async execute(command: ResolveFailureCommand): Promise<UnexpectedFailureResolution> {
    const classified = safeClassify(this.classifier, command.error);
    if (classified?.kind === "expected") {
      const feedback = classified.code === null
        ? errorFeedback(classified.message)
        : codedErrorFeedback({ code: classified.code, message: classified.message });
      return { incident: null, feedback };
    }
    if (classified?.kind === "reported") {
      const feedback = reportedFailureFeedback({ message: classified.message, referenceCode: classified.referenceCode });
      return { incident: { code: feedback.referenceCode ?? classified.referenceCode, recorded: true }, feedback };
    }
    return this.unexpected.execute(command);
  }
}

function safeClassify(classifier: FailureClassifier, error: unknown): ClassifiedFailure | null {
  try { return classifier.classify(error); }
  catch { return null; }
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("Incident report timed out.")), timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}

function autoDismiss(value: number | null | undefined, persistence: FeedbackPersistence): number | null {
  if (value === null || value === undefined) return null;
  if (persistence === "sticky" || !Number.isFinite(value) || value <= 0) {
    throw new ClientFeedbackFailure("CLIENT_FEEDBACK_INVALID", "Feedback auto-dismiss time is invalid.");
  }
  return value;
}

function requiredText(value: string, maximumLength: number, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength) throw new ClientFeedbackFailure("CLIENT_FEEDBACK_INVALID", `${label} is invalid.`);
  return normalized;
}

function optionalText(value: string | null | undefined, maximumLength: number, label: string): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maximumLength) throw new ClientFeedbackFailure("CLIENT_FEEDBACK_INVALID", `${label} is invalid.`);
  return normalized;
}
