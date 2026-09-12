import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("Web scans the installed HeroUI theme relative to its stylesheet", () => {
  const stylesheetUrl = new URL("../app/globals.css", import.meta.url);
  const stylesheet = readFileSync(stylesheetUrl, "utf8");
  const themeSource = stylesheet.match(/@source\s+['"]([^'"]+@heroui\/theme\/dist)\/[^'"]+['"]/);

  assert.ok(themeSource, "HeroUI must be explicitly included in Tailwind source detection");
  const themeDirectory = new URL(`${themeSource[1]}/`, stylesheetUrl);
  assert.ok(existsSync(new URL("components/popover.js", themeDirectory)), "Overlay classes must resolve to the installed theme, not a parent workspace");
});
