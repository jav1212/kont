import assert from "node:assert/strict";
import test from "node:test";
import { emptyProductUnitEconomics } from "../../src/testing";

test("empty unit-economics fixtures contain no observations or coverage", () => {
  const fixture = emptyProductUnitEconomics();
  assert.deepEqual(fixture.points, []);
  assert.equal(fixture.coverage.confirmedAcquisitions, 0);
  assert.equal(fixture.coverage.confirmedSales, 0);
});
