import assert from "node:assert/strict";
import test from "node:test";
import { designTokens, themeVariables } from "../src/tokens";

test("light and dark themes expose the same semantic variables", () => {
  assert.deepEqual(
    Object.keys(themeVariables.light).sort(),
    Object.keys(themeVariables.dark).sort(),
  );
});

test("portable tokens do not expose renderer-specific values", () => {
  assert.equal(designTokens.color.brand.accent, "#FF4A18");
  assert.equal("HTMLElement" in designTokens, false);
});
