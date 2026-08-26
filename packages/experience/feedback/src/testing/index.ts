import type {
  ClientFeedback, FeedbackHandle, FeedbackPresenter, IncidentReference, IncidentReporter, UnexpectedFailureReport,
} from "../application";

export class RecordingFeedbackPresenter implements FeedbackPresenter {
  readonly presented: ClientFeedback[] = [];
  readonly dismissed: FeedbackHandle[] = [];

  /** {@inheritDoc FeedbackPresenter.present} */
  present(feedback: ClientFeedback): FeedbackHandle {
    this.presented.push(feedback);
    return `feedback-${this.presented.length}`;
  }

  /** {@inheritDoc FeedbackPresenter.dismiss} */
  dismiss(handle: FeedbackHandle): void {
    this.dismissed.push(handle);
  }
}

export class RecordingIncidentReporter implements IncidentReporter {
  readonly reports: UnexpectedFailureReport[] = [];

  /**
   * Creates a recorder that returns a deterministic incident reference.
   * @param reference - Incident reference returned for every recorded failure.
   */
  constructor(private readonly reference: IncidentReference = { code: "KNT-20260814-ABCDEF12", recorded: true }) {}

  /** {@inheritDoc IncidentReporter.report} */
  async report(failure: UnexpectedFailureReport): Promise<IncidentReference> {
    this.reports.push(failure);
    return this.reference;
  }
}

export class FailingIncidentReporter implements IncidentReporter {
  /**
   * Creates a reporter double that rejects every report.
   * @param failure - Error used as the rejection reason.
   */
  constructor(private readonly failure: Error = new Error("Incident reporter is unavailable.")) {}

  /** {@inheritDoc IncidentReporter.report} */
  async report(_failure: UnexpectedFailureReport): Promise<IncidentReference> {
    throw this.failure;
  }
}
