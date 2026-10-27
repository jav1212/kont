import assert from "node:assert/strict";
import test from "node:test";
import { toast } from "sonner";
import { errorFeedback, loadingFeedback, reportedFailureFeedback, successFeedback } from "../../src/application";
import { SonnerFeedbackPresenter } from "../../src/adapters/sonner";

type RecordedToast = ReturnType<typeof toast.getHistory>[number] & Record<string, unknown>;

function lastToast(): RecordedToast {
  const history = toast.getHistory() as RecordedToast[];
  const latest = history.at(-1);
  assert.ok(latest, "expected a toast to be recorded");
  return latest;
}

test("sticky incident feedback renders its reference, never auto-closes, and copies the code", async () => {
  const copied: string[] = [];
  const presenter = new SonnerFeedbackPresenter({ copyText: (value) => { copied.push(value); } });
  presenter.present(reportedFailureFeedback({ message: "No se pudo guardar.", referenceCode: "KNT-20261027-ABCDEF12" }));
  const recorded = lastToast();
  assert.equal(recorded.type, "error");
  assert.equal(recorded.id, "KNT-20261027-ABCDEF12");
  assert.equal(recorded.description, "Código: KNT-20261027-ABCDEF12");
  assert.equal(recorded.duration, Number.POSITIVE_INFINITY);
  assert.equal(recorded.closeButton, true);
  const action = recorded.action as { label: string; onClick: () => void };
  assert.equal(action.label, "Copiar código");
  action.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(copied, ["KNT-20261027-ABCDEF12"]);
});

test("transient feedback keeps the viewport default duration and has no copy control", () => {
  const presenter = new SonnerFeedbackPresenter({ copyText: () => {} });
  presenter.present(successFeedback("Empleado guardado."));
  const recorded = lastToast();
  assert.equal(recorded.type, "success");
  assert.equal(recorded.duration, undefined);
  assert.equal(recorded.action, undefined);
});

test("a custom action keeps the reference copy as the secondary control", () => {
  let retried = 0;
  const presenter = new SonnerFeedbackPresenter({ copyText: () => {}, labels: { reference: (code) => `Ref ${code}` } });
  presenter.present(errorFeedback("Sin conexión.", {
    referenceCode: "NETWORK_UNAVAILABLE",
    action: { label: "Reintentar", perform: () => { retried += 1; } },
  }));
  const recorded = lastToast();
  const action = recorded.action as { label: string; onClick: () => void };
  const cancel = recorded.cancel as { label: string };
  assert.equal(action.label, "Reintentar");
  assert.equal(cancel.label, "Copiar código");
  assert.equal(recorded.description, "Ref NETWORK_UNAVAILABLE");
  action.onClick();
  assert.equal(retried, 1);
});

test("loading feedback uses the Sonner loading state and can be dismissed by handle", () => {
  const presenter = new SonnerFeedbackPresenter({ copyText: () => {} });
  const handle = presenter.present(loadingFeedback("Importando…", { deduplicationKey: "import" }));
  assert.equal(lastToast().type, "loading");
  assert.equal(handle, "sonner:import");
  presenter.dismiss(handle);
});
