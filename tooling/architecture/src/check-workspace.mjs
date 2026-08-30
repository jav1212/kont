import { resolve } from "node:path";
import { auditWorkspace } from "./workspace-rules.mjs";

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const violations = await auditWorkspace(workspaceRoot);
if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Workspace package names and application boundaries are valid.");
}
