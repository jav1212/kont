import type {
  ClientFeedback, FeedbackHandle, FeedbackPresenter, IncidentReference, IncidentReporter, UnexpectedFailureReport,
} from "@kontave/client-feedback-application";

export class RecordingFeedbackPresenter implements FeedbackPresenter {
  readonly presented: ClientFeedback[] = [];
  readonly dismissed: FeedbackHandle[] = [];

  present(feedback: ClientFeedback): FeedbackHandle {
    this.presented.push(feedback);
    return `feedback-${this.presented.length}`;
  }

  dismiss(handle: FeedbackHandle): void {
    this.dismissed.push(handle);
  }
}

export class RecordingIncidentReporter implements IncidentReporter {
  readonly reports: UnexpectedFailureReport[] = [];

  constructor(private readonly reference: IncidentReference = { code: "KNT-20260814-ABCDEF12", recorded: true }) {}

  async report(failure: UnexpectedFailureReport): Promise<IncidentReference> {
    this.reports.push(failure);
    return this.reference;
  }
}

export class FailingIncidentReporter implements IncidentReporter {
  constructor(private readonly failure: Error = new Error("Incident reporter is unavailable.")) {}
  async report(_failure: UnexpectedFailureReport): Promise<IncidentReference> {
    throw this.failure;
  }
}
