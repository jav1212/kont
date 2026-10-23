import assert from "node:assert/strict";
import test from "node:test";
import { computeIslrRetention, getIslrConcept } from "../../src/venezuela";

test("PNR fees apply the Decreto 1.808 subtrahend", () => {
  const concept = getIslrConcept("002");
  if (!concept) throw new Error("Concept 002 must exist.");
  assert.deepEqual(computeIslrRetention({ base: 10000, concept, unidadTributaria: 9 }), { porcentaje: 3, sustraendo: 22.5, monto: 277.5 });
  assert.equal(computeIslrRetention({ base: 100, concept, unidadTributaria: 9 }).skippedReason, "sustraendo-mayor-base");
});

test("PJD fees are not withheld below the legal minimum", () => {
  const concept = getIslrConcept("004");
  if (!concept) throw new Error("Concept 004 must exist.");
  assert.equal(computeIslrRetention({ base: 20000, concept, unidadTributaria: 9 }).skippedReason, "below-min-pjd");
  assert.deepEqual(computeIslrRetention({ base: 30000, concept, unidadTributaria: 9 }), { porcentaje: 5, sustraendo: 0, monto: 1500 });
});

test("progressive PJND tariffs are deferred, never guessed", () => {
  const concept = getIslrConcept("005");
  if (!concept) throw new Error("Concept 005 must exist.");
  assert.equal(computeIslrRetention({ base: 1000, concept, unidadTributaria: 9 }).skippedReason, "tariff-not-supported");
});
