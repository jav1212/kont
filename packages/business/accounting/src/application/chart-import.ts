import { AccountingFailure, type AccountType } from "../domain";
import type { InitialAccountInput } from "./commands";

/** Root code classification that an import screen may present for confirmation. */
export interface ChartImportRoot {
  readonly root: string;
  readonly type: AccountType;
  readonly count: number;
  readonly sample: string;
}
/** Result of parsing a legacy MEISTER text or custom CSV chart export. */
export interface ChartImportResult {
  readonly accounts: readonly InitialAccountInput[];
  readonly skipped: number;
}
/**
 * Finds Venezuelan-convention root classifications without asserting a certified VEN-NIF template.
 * @param content - Text export to inspect.
 * @returns Roots, provisional types, account counts, and a sample name.
 * @throws Never; malformed nonblank lines are ignored at this preview stage.
 */
export function detectChartImportRoots(
  content: string,
): readonly ChartImportRoot[] {
  const roots = new Map<
    string,
    { readonly type: AccountType; count: number; readonly sample: string }
  >();
  for (const row of rows(content)) {
    const current = roots.get(row.code.split(".")[0]!);
    if (current) current.count += 1;
    else
      roots.set(row.code.split(".")[0]!, {
        type: inferredType(row.code),
        count: 1,
        sample: row.name,
      });
  }
  return [...roots.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([root, value]) => ({ root, ...value }));
}
/**
 * Parses legacy export rows into portable initial-account inputs.
 * @param content - MEISTER TXT or compatible comma-separated export.
 * @param ids - Stable identifiers in the same order as parsed records.
 * @returns Parsed accounts and count of ignored nonblank lines.
 * @throws {Error} When fewer identifiers than valid rows are supplied.
 */
export function parseChartImport(
  content: string,
  ids: readonly string[],
  rootTypes: Readonly<Record<string, AccountType>> = {},
): ChartImportResult {
  const accounts: InitialAccountInput[] = [];
  let skipped = 0;
  const uniqueIds = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = parse(line);
    if (!row) {
      skipped += 1;
      continue;
    }
    const id = ids[accounts.length]?.trim();
    if (!id || uniqueIds.has(id))
      throw new AccountingFailure(
        "INVALID",
        "Each imported account requires one unique identifier.",
      );
    uniqueIds.add(id);
    const root = row.code.split(/[.\-/]/)[0]!;
    accounts.push({
      id,
      code: row.code,
      name: row.name,
      accountKind: row.group ? "summary" : "detail",
      accountType: rootTypes[root] ?? inferredType(row.code),
      isMemorandum: false,
      monetaryClass: null,
    });
  }
  return { accounts, skipped };
}
interface Row {
  readonly code: string;
  readonly name: string;
  readonly group: boolean;
}
function rows(content: string): readonly Row[] {
  return content.split(/\r?\n/).flatMap((line) => {
    const value = parse(line);
    return value ? [value] : [];
  });
}
function parse(line: string): Row | null {
  const match = /^([^,]+),"([^"]*)",([GM]),\d/.exec(line.trim());
  return match?.[1]?.trim() && match[2]?.trim()
    ? { code: match[1].trim(), name: match[2].trim(), group: match[3] === "G" }
    : null;
}
function inferredType(code: string): AccountType {
  switch (code.split(".")[0]) {
    case "1":
      return "asset";
    case "2":
      return "liability";
    case "3":
      return "equity";
    case "4":
      return "revenue";
    default:
      return "expense";
  }
}
