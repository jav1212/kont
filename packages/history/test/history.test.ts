import assert from "node:assert/strict";
import test from "node:test";
import { emptyHistory, recordHistory, redoHistory, undoHistory } from "../src/index";

test("undo and redo restore complete snapshots with the same action", () => {
  let history = recordHistory(
    emptyHistory<{ lines: readonly string[] }>(),
    { lines: ["A"] },
    { label: "Agregar línea", occurredAt: 1 },
  );

  const undone = undoHistory(history, { lines: ["A", "B"] });
  assert.deepEqual(undone?.snapshot, { lines: ["A"] });
  assert.equal(undone?.action.label, "Agregar línea");

  history = undone!.history;
  const redone = redoHistory(history, undone!.snapshot);
  assert.deepEqual(redone?.snapshot, { lines: ["A", "B"] });
  assert.equal(redone?.action.label, "Agregar línea");
});

test("coalesces repeated edits but keeps the earliest memento", () => {
  let history = recordHistory(
    emptyHistory<{ notes: string }>(),
    { notes: "" },
    { label: "Editar notas", groupKey: "notes", occurredAt: 100 },
  );
  history = recordHistory(
    history,
    { notes: "H" },
    { label: "Editar notas", groupKey: "notes", occurredAt: 200 },
  );

  assert.equal(history.past.length, 1);
  assert.deepEqual(undoHistory(history, { notes: "Ho" })?.snapshot, { notes: "" });
});

test("a new edit after undo invalidates redo", () => {
  const initial = recordHistory(emptyHistory<number>(), 1, { label: "Cambiar cantidad", occurredAt: 1 });
  const undone = undoHistory(initial, 2)!;
  const branched = recordHistory(undone.history, undone.snapshot, { label: "Cambiar precio", occurredAt: 2 });
  assert.equal(branched.future.length, 0);
});

test("enforces the configured history limit", () => {
  let history = emptyHistory<number>();
  for (let value = 0; value < 4; value += 1) {
    history = recordHistory(history, value, { label: `Cambio ${value}`, occurredAt: value }, { limit: 2 });
  }
  assert.deepEqual(history.past.map((entry) => entry.snapshot), [2, 3]);
});
