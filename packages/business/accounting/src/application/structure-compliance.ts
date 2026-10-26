import {
  AccountingFailure,
  accountCodePosition,
  codeStructure,
  type CodeStructure,
  type LedgerAccount,
} from "../domain";

/** One existing account that must be corrected before its proposed structure is activated. */
export interface AccountStructureIssue {
  readonly accountId: string;
  readonly code: string;
  readonly reason: "CODE_OUT_OF_STRUCTURE" | "PARENT_INVALID" | "TYPE_MISMATCH";
}

/**
 * Previews a structure against existing data without changing or hiding nonconforming accounts.
 * @param structure - Proposed segment mask.
 * @param accounts - Complete account projection for one chart.
 * @returns All detected structural and inherited classification issues.
 * @throws {AccountingFailure} When the proposed mask itself is invalid.
 */
export function inspectAccountStructure(
  structure: CodeStructure,
  accounts: readonly LedgerAccount[],
): readonly AccountStructureIssue[] {
  const valid = codeStructure(structure);
  const issues: AccountStructureIssue[] = [];
  const byCode = new Map(accounts.map((account) => [account.code, account]));
  for (const account of accounts) {
    try {
      const position = accountCodePosition(valid, account.code);
      const parent =
        position.parentCode === null
          ? undefined
          : byCode.get(position.parentCode);
      if (
        account.parentCode !== position.parentCode ||
        (position.parentCode !== null &&
          (!parent ||
            parent.kind !== "summary" ||
            parent.chartId !== account.chartId ||
            (account.isActive && !parent.isActive)))
      ) {
        issues.push({
          accountId: account.id,
          code: account.code,
          reason: "PARENT_INVALID",
        });
      } else if (
        parent &&
        (parent.type !== account.type ||
          parent.isMemorandum !== account.isMemorandum ||
          (parent.monetaryClass !== null &&
            parent.monetaryClass !== account.monetaryClass))
      ) {
        issues.push({
          accountId: account.id,
          code: account.code,
          reason: "TYPE_MISMATCH",
        });
      }
    } catch (cause) {
      if (!(cause instanceof AccountingFailure)) throw cause;
      issues.push({
        accountId: account.id,
        code: account.code,
        reason: "CODE_OUT_OF_STRUCTURE",
      });
    }
  }
  return issues;
}
