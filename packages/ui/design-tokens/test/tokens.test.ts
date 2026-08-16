import assert from "node:assert/strict";
import { test } from "node:test";
import { themeVariables } from "../src/index";

test("light and dark themes expose the same semantic variables", () => {
  assert.deepEqual(Object.keys(themeVariables.light).sort(), Object.keys(themeVariables.dark).sort());
});
