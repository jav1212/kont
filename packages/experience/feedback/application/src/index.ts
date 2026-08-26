export type FeedbackIntent = "success" | "error" | "warning" | "info";
export type FeedbackHandle = string;
export type ClientFeedbackFailureCode = "CLIENT_FEEDBACK_INVALID";

export class ClientFeedbackFailure extends Error {
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
  present(feedback: ClientFeedback): FeedbackHandle;
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

export function clientFeedback(input: ClientFeedbackInput): ClientFeedback {
  return {
    intent: input.intent,
    message: requiredText(input.message, 1_000, "Feedback message"),
    description: optionalText(input.description, 2_000, "Feedback description"),
    referenceCode: optionalText(input.referenceCode, 128, "Feedback reference code"),
    deduplicationKey: optionalText(input.deduplicationKey, 200, "Feedback deduplication key"),
  };
}

export function successFeedback(message: string, input: Omit<ClientFeedbackInput, "intent" | "message"> = {}): ClientFeedback {
  return clientFeedback({ ...input, intent: "success", message });
}

export function errorFeedback(message: string, input: Omit<ClientFeedbackInput, "intent" | "message"> = {}): ClientFeedback {
  return clientFeedback({ ...input, intent: "error", message });
}

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

export function warningFeedback(message: string, input: Omit<ClientFeedbackInput, "intent" | "message"> = {}): ClientFeedback {
  return clientFeedback({ ...input, intent: "warning", message });
}

export function infoFeedback(message: string, input: Omit<ClientFeedbackInput, "intent" | "message"> = {}): ClientFeedback {
  return clientFeedback({ ...input, intent: "info", message });
}

export class PresentFeedback {
  constructor(private readonly presenter: FeedbackPresenter) {}

  execute(feedback: ClientFeedback): FeedbackHandle {
    return this.presenter.present(clientFeedback(feedback));
  }

  dismiss(handle: FeedbackHandle): void {
    const normalized = handle.trim();
    if (!normalized) throw new ClientFeedbackFailure("CLIENT_FEEDBACK_INVALID", "Feedback handle is required.");
    this.presenter.dismiss(normalized);
  }
}

export class ResolveUnexpectedFailure {
  constructor(private readonly incidents: IncidentReporter) {}

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
