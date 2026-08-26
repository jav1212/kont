export type FeedbackIntent = "success" | "error" | "warning" | "info";
export type FeedbackHandle = string;
export type ClientFeedbackFailureCode = "CLIENT_FEEDBACK_INVALID";

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

export interface ClientFeedback {
  readonly intent: FeedbackIntent;
  readonly message: string;
  readonly description: string | null;
  readonly referenceCode: string | null;
  readonly deduplicationKey: string | null;
}

export interface FeedbackPresenter {
  /**
   * Presents feedback through the current client surface.
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

export interface UnexpectedFailureResolution {
  readonly feedback: ClientFeedback;
  readonly incident: IncidentReference | null;
}

export type ClientFeedbackInput = Omit<ClientFeedback, "description" | "referenceCode" | "deduplicationKey"> & {
  readonly description?: string | null;
  readonly referenceCode?: string | null;
  readonly deduplicationKey?: string | null;
};

/**
 * Validates and normalizes portable feedback before it reaches a platform presenter.
 * @param input - Feedback intent, public copy, reference, and deduplication metadata.
 * @returns A normalized immutable feedback value.
 * @throws {ClientFeedbackFailure} When required text is empty or a field exceeds its public limit.
 */
export function clientFeedback(input: ClientFeedbackInput): ClientFeedback {
  return {
    intent: input.intent,
    message: requiredText(input.message, 1_000, "Feedback message"),
    description: optionalText(input.description, 2_000, "Feedback description"),
    referenceCode: optionalText(input.referenceCode, 128, "Feedback reference code"),
    deduplicationKey: optionalText(input.deduplicationKey, 200, "Feedback deduplication key"),
  };
}

/**
 * Creates validated success feedback.
 * @param message - Public success message.
 * @param input - Optional description, reference, and deduplication metadata.
 * @returns Portable success feedback.
 * @throws {ClientFeedbackFailure} When any text field is invalid.
 */
export function successFeedback(message: string, input: Omit<ClientFeedbackInput, "intent" | "message"> = {}): ClientFeedback {
  return clientFeedback({ ...input, intent: "success", message });
}

/**
 * Creates validated error feedback.
 * @param message - Public error message.
 * @param input - Optional description, reference, and deduplication metadata.
 * @returns Portable error feedback.
 * @throws {ClientFeedbackFailure} When any text field is invalid.
 */
export function errorFeedback(message: string, input: Omit<ClientFeedbackInput, "intent" | "message"> = {}): ClientFeedback {
  return clientFeedback({ ...input, intent: "error", message });
}

/**
 * Creates error feedback whose stable domain code is also its default deduplication key.
 * @param input - Stable code, public message, and optional deduplication override.
 * @returns Portable coded error feedback.
 * @throws {ClientFeedbackFailure} When the code or message is invalid.
 */
export function codedErrorFeedback(input: {
  readonly code: string;
  readonly message: string;
  readonly deduplicationKey?: string | null;
}): ClientFeedback {
  const referenceCode = requiredText(input.code, 128, "Error code");
  return errorFeedback(input.message, {
    referenceCode,
    deduplicationKey: input.deduplicationKey ?? referenceCode,
  });
}

/**
 * Creates validated warning feedback.
 * @param message - Public warning message.
 * @param input - Optional description, reference, and deduplication metadata.
 * @returns Portable warning feedback.
 * @throws {ClientFeedbackFailure} When any text field is invalid.
 */
export function warningFeedback(message: string, input: Omit<ClientFeedbackInput, "intent" | "message"> = {}): ClientFeedback {
  return clientFeedback({ ...input, intent: "warning", message });
}

/**
 * Creates validated informational feedback.
 * @param message - Public informational message.
 * @param input - Optional description, reference, and deduplication metadata.
 * @returns Portable informational feedback.
 * @throws {ClientFeedbackFailure} When any text field is invalid.
 */
export function infoFeedback(message: string, input: Omit<ClientFeedbackInput, "intent" | "message"> = {}): ClientFeedback {
  return clientFeedback({ ...input, intent: "info", message });
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
}

export class ResolveUnexpectedFailure {
  /**
   * Creates the unexpected-failure resolver with an explicit incident-reporting port.
   * @param incidents - Incident reporter used before exposing a public reference.
   */
  constructor(private readonly incidents: IncidentReporter) {}

  /**
   * Attempts to report an unexpected failure and always returns safe public feedback.
   * Reporter failures are deliberately absorbed so they never mask the original operation failure.
   * @param report - Unexpected failure details and safe public message.
   * @returns Feedback with an incident reference when reporting succeeds, otherwise unreferenced feedback.
   * @throws {ClientFeedbackFailure} When the public message or returned incident reference is invalid.
   */
  async execute(report: UnexpectedFailureReport): Promise<UnexpectedFailureResolution> {
    const publicMessage = requiredText(report.publicMessage, 1_000, "Unexpected failure public message");
    try {
      const incident = await this.incidents.report({ ...report, publicMessage });
      const referenceCode = requiredText(incident.code, 128, "Incident reference code");
      return {
        incident: { ...incident, code: referenceCode },
        feedback: errorFeedback(publicMessage, {
          description: `Codigo: ${referenceCode}`,
          referenceCode,
          deduplicationKey: referenceCode,
        }),
      };
    } catch {
      return {
        incident: null,
        feedback: errorFeedback(publicMessage),
      };
    }
  }
}

/**
 * Creates feedback for a backend failure whose incident has already been recorded.
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
    description: `Codigo: ${referenceCode}`,
    referenceCode,
    deduplicationKey: input.deduplicationKey ?? referenceCode,
  });
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
