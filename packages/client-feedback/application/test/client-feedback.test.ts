import assert from "node:assert/strict";
import test from "node:test";
import {
  PresentFeedback, ResolveUnexpectedFailure, errorFeedback, reportedFailureFeedback,
  type ClientFeedback, type FeedbackPresenter, type IncidentReporter,
} from "../src/index.js";

class RecordingPresenter implements FeedbackPresenter {
  readonly presented: ClientFeedback[] = [];
  readonly dismissed: string[] = [];
  present(feedback: ClientFeedback): string {
    this.presented.push(feedback);
    return `feedback-${this.presented.length}`;
  }
  dismiss(handle: string): void { this.dismissed.push(handle); }
}

test("expected failures are presented without creating an incident", () => {
  const presenter = new RecordingPresenter();
  const useCase = new PresentFeedback(presenter);
  const handle = useCase.execute(errorFeedback("El cliente esta inactivo.", { deduplicationKey: "customer-inactive" }));
  assert.equal(handle, "feedback-1");
  assert.equal(presenter.presented[0]?.referenceCode, null);
  useCase.dismiss(handle);
  assert.deepEqual(presenter.dismissed, ["feedback-1"]);
});

test("unexpected failures become portable feedback with the incident reference", async () => {
  const reports: string[] = [];
  const reporter: IncidentReporter = {
    report: async (failure) => { reports.push(failure.eventName); return { code: "KNT-20260814-ABCDEF12", recorded: true }; },
  };
  const result = await new ResolveUnexpectedFailure(reporter).execute({
    eventName: "sales.confirm.unexpected_failure",
    error: new Error("database unavailable"),
    publicMessage: "No se pudo completar la venta.",
  });
  assert.deepEqual(reports, ["sales.confirm.unexpected_failure"]);
  assert.equal(result.feedback.referenceCode, "KNT-20260814-ABCDEF12");
  assert.equal(result.feedback.description, "Codigo: KNT-20260814-ABCDEF12");
  assert.equal(result.incident?.recorded, true);
});

test("incident reporter failure never masks the original public failure", async () => {
  const result = await new ResolveUnexpectedFailure({ report: async () => { throw new Error("offline"); } }).execute({
    eventName: "desktop.render.unexpected_failure",
    error: new Error("render failed"),
    publicMessage: "Ocurrio un error inesperado.",
  });
  assert.equal(result.incident, null);
  assert.equal(result.feedback.message, "Ocurrio un error inesperado.");
  assert.equal(result.feedback.referenceCode, null);
});

test("an already reported backend incident is displayed without reporting it again", () => {
  const feedback = reportedFailureFeedback({ message: "No se pudo guardar.", referenceCode: "KNT-20260814-12345678" });
  assert.equal(feedback.referenceCode, "KNT-20260814-12345678");
  assert.equal(feedback.deduplicationKey, "KNT-20260814-12345678");
});
