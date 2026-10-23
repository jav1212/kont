import type { ExactDecimal } from "@kontave/monetary/domain";
import type { TreasuryQuery, TreasuryWriteCommand } from "../application";
import type { TreasuryMoney, TreasuryScope } from "../domain";

/** Transport-safe write request. The server derives tenant, organization, company and actor scope. */
type WithoutScope<T> = T extends TreasuryScope ? Omit<T, keyof TreasuryScope> : never;
/** Monetary input as serialized by clients. The server validates the decimal and derives the operational valuation snapshot. */
export interface TreasuryMoneyInput { readonly amount: string; readonly currency: string; }
/**
 * Rewrites domain value objects into their JSON wire form: money loses its server-derived valuation and
 * exact decimals travel as decimal text. Discriminants and other scalar fields are preserved.
 */
type WireForm<T> = T extends TreasuryMoney ? TreasuryMoneyInput
  : T extends ExactDecimal ? string
  : T extends readonly (infer Item)[] ? readonly WireForm<Item>[]
  : T extends object ? { readonly [Key in keyof T]: WireForm<T[Key]> }
  : T;
/** Transport-safe write request with its discriminated command fields preserved. */
export type TreasuryCommandRequest = WireForm<WithoutScope<TreasuryWriteCommand>>;
/** Transport-safe read request. The server derives tenant, organization, company and actor scope. */
export type TreasuryQueryRequest = WithoutScope<TreasuryQuery>;
/** Read row union returned by the authorized Treasury query port. */
export type { TreasuryReadRow } from "../application";
