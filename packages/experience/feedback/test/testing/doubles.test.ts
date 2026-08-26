import assert from "node:assert/strict";
import test from "node:test";
import { errorFeedback } from "../../src/application";
import { RecordingFeedbackPresenter, RecordingIncidentReporter } from "../../src/testing";

test("client feedback test doubles retain semantic calls", async () => {
  const presenter = new RecordingFeedbackPresenter();
  const reporter = new RecordingIncidentReporter();
  presenter.present(errorFeedback("No se pudo guardar."));
  await reporter.report({ eventName: "save.failed", error: new Error("offline"), publicMessage: "No se pudo guardar." });
  assert.equal(presenter.presented[0]?.intent, "error");
  assert.equal(reporter.reports[0]?.eventName, "save.failed");
});
