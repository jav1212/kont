import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const expected = [
  "Alert",
  "Breadcrumbs",
  "Button",
  "Card",
  "Checkbox",
  "DatePeriodPicker",
  "DatePicker",
  "FieldSkeleton",
  "Heading",
  "ImageWithFallback",
  "LogoFull",
  "LogoMark",
  "OptionPicker",
  "PageShell",
  "Screen",
  "Sidebar",
  "SidebarAction",
  "SidebarFooter",
  "SidebarHeader",
  "SidebarLink",
  "SidebarNav",
  "SidebarSection",
  "Skeleton",
  "Stack",
  "StatusBadge",
  "Text",
  "TextField",
  "UiProvider",
  "useUiTheme",
].sort();

test("both public renderer entries expose the entire agreed catalog", () => {
  for (const renderer of ["dom/src/index.ts", "react-native/src/index.tsx"]) {
    const source = readFileSync(
      new URL(`../../${renderer}`, import.meta.url),
      "utf8",
    );
    const ast = ts.createSourceFile(renderer, source, ts.ScriptTarget.Latest);
    const exports = ast.statements
      .flatMap((statement) => {
        if (
          !ts.isExportDeclaration(statement) ||
          statement.isTypeOnly ||
          !statement.exportClause ||
          !ts.isNamedExports(statement.exportClause)
        )
          return [];
        return statement.exportClause.elements
          .filter((element) => !element.isTypeOnly)
          .map((element) => element.name.text);
      })
      .filter(
        (name) => !["applyDesignTokens", "reactNativeTheme"].includes(name),
      );
    assert.deepEqual(exports.sort(), expected, renderer);
  }
});
