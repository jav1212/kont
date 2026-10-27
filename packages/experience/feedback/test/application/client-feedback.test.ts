import assert from "node:assert/strict";
import test from "node:test";
import {
  ClientFeedbackFailure, PresentFeedback, ResolveFailure, ResolveUnexpectedFailure, clientFeedback, codedErrorFeedback,
  errorFeedback, loadingFeedback, reportedFailureFeedback, successFeedback,
  type FailureClassifier, type IncidentReporter,
} from "../../src/application";
import { FailingIncidentReporter, RecordingFeedbackPresenter, RecordingIncidentReporter } from "../../src/testing";

test("expected failures are presented without creating an incident", () => {
  const presenter = new RecordingFeedbackPresenter();
  const useCase = new PresentFeedback(presenter);
  const handle = useCase.execute(errorFeedback("El cliente esta inactivo.", { deduplicationKey: "customer-inactive" }));
  assert.equal(handle, "feedback-1");
  assert.equal(presenter.presented[0]?.referenceCode, null);
  assert.equal(presenter.presented[0]?.persistence, "transient");
  useCase.dismiss(handle);
  assert.deepEqual(presenter.dismissed, ["feedback-1"]);
});

test("typed expected failures expose their stable code as a copyable reference", () => {
  const feedback = codedErrorFeedback({
    code: "WORKSPACE_MODULE_UNAVAILABLE",
    message: "No se pudo cambiar el módulo activo.",
  });
  assert.equal(feedback.referenceCode, "WORKSPACE_MODULE_UNAVAILABLE");
  assert.equal(feedback.deduplicationKey, "WORKSPACE_MODULE_UNAVAILABLE");
  assert.equal(feedback.persistence, "transient");
});

test("feedback validation rejects empty or oversized public copy", () => {
  assert.throws(() => errorFeedback("   "), ClientFeedbackFailure);
  assert.throws(() => errorFeedback("x".repeat(1_001)), ClientFeedbackFailure);
  assert.throws(() => errorFeedback("Fallo", { referenceCode: "x".repeat(129) }), ClientFeedbackFailure);
  assert.throws(() => errorFeedback("Fallo", { action: { label: " ", perform: () => {} } }), ClientFeedbackFailure);
  assert.equal(errorFeedback("Fallo", { description: "   " }).description, null);
});

test("feedback values are immutable and keep their action callable", () => {
  let performed = 0;
  const feedback = clientFeedback({ intent: "info", message: "Borrador eliminado.", action: { label: "Deshacer", perform: () => { performed += 1; } } });
  assert.ok(Object.isFrozen(feedback));
  void feedback.action?.perform();
  assert.equal(performed, 1);
  assert.equal(feedback.action?.label, "Deshacer");
});

test("loading feedback is sticky until its operation settles", () => {
  assert.equal(loadingFeedback("Guardando…").persistence, "sticky");
  assert.equal(successFeedback("Guardado.").persistence, "transient");
});

test("unexpected failures become sticky feedback with the incident reference and no presentation copy", async () => {
  const reporter = new RecordingIncidentReporter();
  const result = await new ResolveUnexpectedFailure(reporter).execute({
    eventName: "sales.confirm.unexpected_failure",
    error: new Error("database unavailable"),
    publicMessage: "No se pudo completar la venta.",
    fingerprint: "sales.confirm",
  });
  assert.equal(reporter.reports[0]?.eventName, "sales.confirm.unexpected_failure");
  assert.equal(result.feedback.referenceCode, "KNT-20260814-ABCDEF12");
  assert.equal(result.feedback.description, null);
  assert.equal(result.feedback.deduplicationKey, "sales.confirm");
  assert.equal(result.feedback.persistence, "sticky");
  assert.equal(result.incident?.recorded, true);
});

test("incident reporter failure never masks the original public failure", async () => {
  const result = await new ResolveUnexpectedFailure(new FailingIncidentReporter()).execute({
    eventName: "desktop.render.unexpected_failure",
    error: new Error("render failed"),
    publicMessage: "Ocurrio un error inesperado.",
  });
  assert.equal(result.incident, null);
  assert.equal(result.feedback.message, "Ocurrio un error inesperado.");
  assert.equal(result.feedback.referenceCode, null);
});

test("a hanging incident reporter cannot delay feedback beyond the timeout", async () => {
  const hanging: IncidentReporter = { report: () => new Promise(() => {}) };
  const startedAt = Date.now();
  const result = await new ResolveUnexpectedFailure(hanging, { reportTimeoutMs: 20 }).execute({
    eventName: "web.save.unexpected_failure",
    error: new Error("socket hang up"),
    publicMessage: "No se pudo guardar.",
  });
  assert.ok(Date.now() - startedAt < 1_000);
  assert.equal(result.incident, null);
  assert.equal(result.feedback.message, "No se pudo guardar.");
});

test("the resolver rejects a non-positive report timeout", () => {
  assert.throws(() => new ResolveUnexpectedFailure(new RecordingIncidentReporter(), { reportTimeoutMs: 0 }), ClientFeedbackFailure);
});

test("an already reported backend incident is displayed without reporting it again", () => {
  const feedback = reportedFailureFeedback({ message: "No se pudo guardar.", referenceCode: "KNT-20260814-12345678" });
  assert.equal(feedback.referenceCode, "KNT-20260814-12345678");
  assert.equal(feedback.deduplicationKey, "KNT-20260814-12345678");
  assert.equal(feedback.persistence, "sticky");
});

class CodeClassifier implements FailureClassifier {
  classify(error: unknown) {
    if (error instanceof RangeError) return { kind: "expected", code: "AMOUNT_INVALID", message: "El monto no es válido." } as const;
    if (error instanceof SyntaxError) return { kind: "reported", referenceCode: "KNT-20261027-AAAA1111", message: "El servidor falló." } as const;
    return null;
  }
}

test("classified expected failures never create incidents", async () => {
  const reporter = new RecordingIncidentReporter();
  const result = await new ResolveFailure(new CodeClassifier(), new ResolveUnexpectedFailure(reporter)).execute({
    eventName: "web.payment.failed",
    error: new RangeError("negative"),
    publicMessage: "No se pudo registrar el pago.",
  });
  assert.equal(reporter.reports.length, 0);
  assert.equal(result.incident, null);
  assert.equal(result.feedback.message, "El monto no es válido.");
  assert.equal(result.feedback.referenceCode, "AMOUNT_INVALID");
});

test("failures already recorded by another tier are shown with their reference and never reported again", async () => {
  const reporter = new RecordingIncidentReporter();
  const result = await new ResolveFailure(new CodeClassifier(), new ResolveUnexpectedFailure(reporter)).execute({
    eventName: "web.save.failed",
    error: new SyntaxError("500"),
    publicMessage: "No se pudo guardar.",
  });
  assert.equal(reporter.reports.length, 0);
  assert.deepEqual(result.incident, { code: "KNT-20261027-AAAA1111", recorded: true });
  assert.equal(result.feedback.message, "El servidor falló.");
  assert.equal(result.feedback.persistence, "sticky");
});

test("transient feedback accepts an exact auto-dismiss window; sticky feedback rejects it", () => {
  assert.equal(successFeedback("Eliminado.", { autoDismissMs: 5_000 }).autoDismissMs, 5_000);
  assert.equal(successFeedback("Eliminado.").autoDismissMs, null);
  assert.throws(() => errorFeedback("Fallo", { persistence: "sticky", autoDismissMs: 5_000 }), ClientFeedbackFailure);
  assert.throws(() => successFeedback("Eliminado.", { autoDismissMs: 0 }), ClientFeedbackFailure);
});

test("unclassified failures and throwing classifiers fall back to incident reporting", async () => {
  const reporter = new RecordingIncidentReporter();
  const throwing: FailureClassifier = { classify: () => { throw new Error("classifier bug"); } };
  const resolver = new ResolveUnexpectedFailure(reporter);
  await new ResolveFailure(new CodeClassifier(), resolver).execute({ eventName: "web.a.failed", error: new Error("boom"), publicMessage: "Fallo A." });
  const result = await new ResolveFailure(throwing, resolver).execute({ eventName: "web.b.failed", error: new RangeError("x"), publicMessage: "Fallo B." });
  assert.equal(reporter.reports.length, 2);
  assert.equal(result.feedback.message, "Fallo B.");
});

test("tracked operations replace progress with success", async () => {
  const presenter = new RecordingFeedbackPresenter();
  const value = await new PresentFeedback(presenter).track(Promise.resolve(3), {
    loading: "Importando…",
    success: (count) => `${count} filas importadas.`,
    failure: () => errorFeedback("No se pudo importar."),
  });
  assert.equal(value, 3);
  assert.deepEqual(presenter.presented.map((item) => item.intent), ["loading", "success"]);
  assert.equal(presenter.presented[1]?.message, "3 filas importadas.");
  assert.deepEqual(presenter.dismissed, ["feedback-1"]);
});

test("tracked operations present failure feedback and rethrow the original reason", async () => {
  const presenter = new RecordingFeedbackPresenter();
  const reason = new Error("offline");
  await assert.rejects(new PresentFeedback(presenter).track(Promise.reject(reason), {
    loading: "Importando…",
    success: "Importado.",
    failure: () => errorFeedback("No se pudo importar."),
  }), (error) => error === reason);
  assert.deepEqual(presenter.presented.map((item) => item.intent), ["loading", "error"]);
  assert.deepEqual(presenter.dismissed, ["feedback-1"]);
});
