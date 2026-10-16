import type { TreasuryQuery, TreasuryWriteCommand } from "../application";
import type { TreasuryScope } from "../domain";

/** Transport-safe write request. The server derives tenant, organization, company and actor scope. */
type WithoutScope<T> = T extends TreasuryScope ? Omit<T, keyof TreasuryScope> : never;
/** Transport-safe write request with its discriminated command fields preserved. */
export type TreasuryCommandRequest = WithoutScope<TreasuryWriteCommand>;
/** Transport-safe read request. The server derives tenant, organization, company and actor scope. */
export type TreasuryQueryRequest = WithoutScope<TreasuryQuery>;
/** Read row union returned by the authorized Treasury query port. */
export type { TreasuryReadRow } from "../application";
