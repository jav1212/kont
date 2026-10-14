import type { OrganizationId, UserId } from "@kontave/organizations/domain";
import {
  companyDocumentSeriesCode, companyDocumentSeriesMaximum, companyDocumentSeriesPrefix, companyDocumentSeriesScope,
  companyDocumentSeriesSelectionPolicy, companyDocumentType, CompanyFailure,
  type CompanyDocumentNumberingSeries, type CompanyDocumentSeriesScope, type CompanyDocumentSeriesSelectionPolicy,
  type CompanyDocumentSeriesSelectionRule, type CompanyDocumentType, type CompanyId,
} from "../domain";

/** Authenticated actor and company boundary for document-numbering operations. */
export interface CompanyDocumentNumberingScope {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
}
/** Permission boundary operations owned by this capability. */
export enum CompanyDocumentNumberingOperation { Configure = "configure", Read = "read", Allocate = "allocate" }
/** Authorization port independent of persistence and transport. */
export interface CompanyDocumentNumberingAuthorization {
  /** @param scope - Authenticated actor and isolated company boundary. @param operation - Requested business operation. @returns Nothing when authorized. @throws {CompanyFailure} When access is denied or unavailable. */
  assertCanManageDocumentNumbering(scope: CompanyDocumentNumberingScope, operation: CompanyDocumentNumberingOperation): Promise<void>;
}
/** Idempotent creation request for a series under one company or branch. */
export interface CreateCompanyDocumentNumberingSeriesCommand
  extends CompanyDocumentNumberingScope {
  readonly idempotencyKey: string;
  readonly scope: CompanyDocumentSeriesScope;
  readonly documentType: CompanyDocumentType;
  readonly code: string;
  readonly prefix: string | null;
  readonly nextNumber: number;
  readonly maximumNumber: number;
}
/** Read request for series in exactly one explicit scope. */
export interface ListCompanyDocumentNumberingSeriesQuery
  extends CompanyDocumentNumberingScope {
  readonly scope: CompanyDocumentSeriesScope;
  readonly documentType?: CompanyDocumentType;
}
/** Versioned rule deciding how a type selects its series. */
export interface ConfigureCompanyDocumentSeriesSelectionRuleCommand
  extends CompanyDocumentNumberingScope {
  readonly idempotencyKey: string;
  readonly scope: CompanyDocumentSeriesScope;
  readonly documentType: CompanyDocumentType;
  readonly expectedVersion: number;
  readonly policy: CompanyDocumentSeriesSelectionPolicy;
  readonly defaultSeriesId: string | null;
}
/** Either request a named series or let the persisted policy resolve it. */
export type CompanyDocumentSeriesSelection =
  | { readonly kind: "explicit"; readonly seriesId: string }
  | { readonly kind: "policy" };
/** Idempotent allocation request. Its persistence must be coupled to saving the target document. */
export interface AllocateCompanyDocumentNumberCommand
  extends CompanyDocumentNumberingScope {
  readonly idempotencyKey: string;
  readonly documentId: string;
  readonly scope: CompanyDocumentSeriesScope;
  readonly documentType: CompanyDocumentType;
  readonly selection: CompanyDocumentSeriesSelection;
}
/** Durable allocation returned by a repository transaction. */
export interface CompanyDocumentNumberAllocation {
  readonly documentId: string;
  readonly seriesId: string;
  readonly documentType: CompanyDocumentType;
  readonly displayNumber: string;
  readonly number: number;
}

/** Persistence boundary for scoped series configuration, independent of document issuance. */
export interface CompanyDocumentSeriesConfigurationRepository {
  /** @param command - Authorized normalized series creation. @returns New or replayed series. @throws {CompanyFailure} On duplicate, conflicting replay, or storage failure. */
  createSeries(command: CreateCompanyDocumentNumberingSeriesCommand): Promise<CompanyDocumentNumberingSeries>;
  /** @param query - Authorized normalized scope and optional type. @returns Series snapshots. @throws {CompanyFailure} When access or storage fails. */
  listSeries(query: ListCompanyDocumentNumberingSeriesQuery): Promise<readonly CompanyDocumentNumberingSeries[]>;
  /** @param command - Authorized normalized policy change. @returns Persisted selection rule. @throws {CompanyFailure} On stale state, conflicting replay, or storage failure. */
  configureSelectionRule(command: ConfigureCompanyDocumentSeriesSelectionRuleCommand): Promise<CompanyDocumentSeriesSelectionRule>;
}

/**
 * Persistence boundary reserved for atomic document issuance. Implementations must lock the selected
 * series and save the document, increment, allocation, and idempotency receipt in one transaction.
 */
export interface CompanyDocumentNumberAllocationRepository {
  /** @param command - Authorized normalized issuance request. @returns Durable allocation or exact replay. @throws {CompanyFailure} On exhaustion, selection error, conflicting replay, or storage failure. */
  allocate(command: AllocateCompanyDocumentNumberCommand): Promise<CompanyDocumentNumberAllocation>;
}

/** Combined port retained for callers composing both configuration and issuance. */
export interface CompanyDocumentNumberingSeriesRepository
  extends CompanyDocumentSeriesConfigurationRepository, CompanyDocumentNumberAllocationRepository {}

/** Registers a series without altering the current fixed legacy counters. */
export class CreateCompanyDocumentNumberingSeries {
  /** @param authorization - Configuration authorization port. @param repository - Atomic persistence port. @returns Use case. */
  constructor(
    private readonly authorization: CompanyDocumentNumberingAuthorization,
    private readonly repository: CompanyDocumentSeriesConfigurationRepository,
  ) {}
  /** @param command - Series configuration and authenticated scope. @returns New or replayed series. @throws {CompanyFailure} When validation, authorization, or storage fails. */
  async execute(
    command: CreateCompanyDocumentNumberingSeriesCommand,
  ): Promise<CompanyDocumentNumberingSeries> {
    const normalized = normalizeCreate(command);
    await this.authorization.assertCanManageDocumentNumbering(
      normalized,
      CompanyDocumentNumberingOperation.Configure,
    );
    return this.repository.createSeries(normalized);
  }
}
/** Lists selectable series in one company or branch scope. */
export class ListCompanyDocumentNumberingSeries {
  /** @param authorization - Read authorization port. @param repository - Persistence port. @returns Use case. */
  constructor(
    private readonly authorization: CompanyDocumentNumberingAuthorization,
    private readonly repository: CompanyDocumentSeriesConfigurationRepository,
  ) {}
  /** @param query - Authenticated scope with optional typed filter. @returns Matching series. @throws {CompanyFailure} When authorization or storage fails. */
  async execute(
    query: ListCompanyDocumentNumberingSeriesQuery,
  ): Promise<readonly CompanyDocumentNumberingSeries[]> {
    const normalized = {
      ...query,
      scope: normalizeScope(query, query.scope),
      ...(query.documentType === undefined
        ? {}
        : { documentType: companyDocumentType(query.documentType) }),
    };
    await this.authorization.assertCanManageDocumentNumbering(
      normalized,
      CompanyDocumentNumberingOperation.Read,
    );
    return this.repository.listSeries(normalized);
  }
}
/** Changes a versioned type-selection rule. */
export class ConfigureCompanyDocumentSeriesSelectionRule {
  /** @param authorization - Configuration authorization port. @param repository - Atomic persistence port. @returns Use case. */
  constructor(
    private readonly authorization: CompanyDocumentNumberingAuthorization,
    private readonly repository: CompanyDocumentSeriesConfigurationRepository,
  ) {}
  /** @param command - Idempotent versioned selection rule. @returns Persisted rule. @throws {CompanyFailure} When validation, access, concurrency, or storage fails. */
  async execute(
    command: ConfigureCompanyDocumentSeriesSelectionRuleCommand,
  ): Promise<CompanyDocumentSeriesSelectionRule> {
    const scope = normalizeScope(command, command.scope);
    const selected = companyDocumentSeriesSelectionPolicy(
      scope,
      command.policy,
      command.defaultSeriesId,
    );
    const normalized = {
      ...command,
      idempotencyKey: idempotencyKey(command.idempotencyKey),
      scope,
      documentType: companyDocumentType(command.documentType),
      expectedVersion: expectedVersion(command.expectedVersion),
      ...selected,
    };
    await this.authorization.assertCanManageDocumentNumbering(
      normalized,
      CompanyDocumentNumberingOperation.Configure,
    );
    return this.repository.configureSelectionRule(normalized);
  }
}
/** Requests a single transactionally coupled document-number allocation. */
export class AllocateCompanyDocumentNumber {
  /** @param authorization - Issuance authorization port. @param repository - Atomic persistence port. @returns Use case. */
  constructor(
    private readonly authorization: CompanyDocumentNumberingAuthorization,
    private readonly repository: CompanyDocumentNumberAllocationRepository,
  ) {}
  /** @param command - Document identity and series selection intent. @returns Durable allocation or exact retry. @throws {CompanyFailure} When validation, authorization, exhaustion, or storage fails. */
  async execute(
    command: AllocateCompanyDocumentNumberCommand,
  ): Promise<CompanyDocumentNumberAllocation> {
    const normalized = {
      ...command,
      idempotencyKey: idempotencyKey(command.idempotencyKey),
      documentId: documentId(command.documentId),
      scope: normalizeScope(command, command.scope),
      documentType: companyDocumentType(command.documentType),
      selection: selection(command.selection),
    };
    await this.authorization.assertCanManageDocumentNumbering(
      normalized,
      CompanyDocumentNumberingOperation.Allocate,
    );
    return this.repository.allocate(normalized);
  }
}
/** @param authorization - Authorization boundary. @param repository - Atomic persistence boundary. @returns All reusable series use cases. @throws {CompanyFailure} When a dependency is unavailable. */
export function companyDocumentNumberingSeriesActions(authorization: CompanyDocumentNumberingAuthorization, repository: CompanyDocumentNumberingSeriesRepository): { readonly create: CreateCompanyDocumentNumberingSeries; readonly list: ListCompanyDocumentNumberingSeries; readonly configureSelectionRule: ConfigureCompanyDocumentSeriesSelectionRule; readonly allocate: AllocateCompanyDocumentNumber } { return Object.freeze({ create: new CreateCompanyDocumentNumberingSeries(authorization, repository), list: new ListCompanyDocumentNumberingSeries(authorization, repository), configureSelectionRule: new ConfigureCompanyDocumentSeriesSelectionRule(authorization, repository), allocate: new AllocateCompanyDocumentNumber(authorization, repository) }); }

/**
 * Composes configuration use cases without exposing allocation before a document-owned issuance adapter exists.
 * @param authorization - Scoped authorization boundary.
 * @param repository - Series configuration persistence boundary.
 * @returns Create, list, and selection-rule use cases.
 */
export function companyDocumentSeriesConfigurationActions(
  authorization: CompanyDocumentNumberingAuthorization,
  repository: CompanyDocumentSeriesConfigurationRepository,
): {
  readonly create: CreateCompanyDocumentNumberingSeries;
  readonly list: ListCompanyDocumentNumberingSeries;
  readonly configureSelectionRule: ConfigureCompanyDocumentSeriesSelectionRule;
} {
  return Object.freeze({
    create: new CreateCompanyDocumentNumberingSeries(authorization, repository),
    list: new ListCompanyDocumentNumberingSeries(authorization, repository),
    configureSelectionRule: new ConfigureCompanyDocumentSeriesSelectionRule(authorization, repository),
  });
}

function normalizeCreate(command: CreateCompanyDocumentNumberingSeriesCommand): CreateCompanyDocumentNumberingSeriesCommand { const scope = normalizeScope(command, command.scope); const maximumNumber = companyDocumentSeriesMaximum(command.maximumNumber); if (!Number.isSafeInteger(command.nextNumber) || command.nextNumber < 1 || command.nextNumber > maximumNumber) throw new CompanyFailure("COMPANY_DOCUMENT_SERIES_INVALID", "The document series next number is invalid."); return { ...command, idempotencyKey: idempotencyKey(command.idempotencyKey), scope, documentType: companyDocumentType(command.documentType), code: companyDocumentSeriesCode(command.code), prefix: companyDocumentSeriesPrefix(command.prefix), maximumNumber }; }
function normalizeScope(command: CompanyDocumentNumberingScope, scope: CompanyDocumentSeriesScope): CompanyDocumentSeriesScope { const normalized = companyDocumentSeriesScope(scope); if (normalized.organizationId !== command.organizationId || normalized.companyId !== command.companyId) throw new CompanyFailure("COMPANY_OUTSIDE_ORGANIZATION", "The document series scope is outside the requested company."); return normalized; }
function idempotencyKey(value: string): string { const normalized = value.trim(); if (!normalized || normalized.length > 128) throw new CompanyFailure("COMPANY_DOCUMENT_SERIES_INVALID", "The idempotency key is invalid."); return normalized; }
function expectedVersion(value: number): number { if (!Number.isSafeInteger(value) || value < 0) throw new CompanyFailure("COMPANY_DOCUMENT_SERIES_INVALID", "The document series expected version is invalid."); return value; }
function documentId(value: string): string { const normalized = value.trim(); if (!normalized || normalized.length > 128) throw new CompanyFailure("COMPANY_DOCUMENT_SERIES_INVALID", "The document identifier is invalid."); return normalized; }
function selection(value: unknown): CompanyDocumentSeriesSelection {
  if (!value || typeof value !== "object") {
    throw new CompanyFailure("COMPANY_DOCUMENT_SERIES_SELECTION_INVALID", "The document series selection is invalid.");
  }
  const candidate = value as Partial<CompanyDocumentSeriesSelection>;
  if (candidate.kind === "policy") return Object.freeze({ kind: "policy" });
  const seriesId = candidate.kind === "explicit" && typeof candidate.seriesId === "string"
    ? candidate.seriesId.trim()
    : "";
  if (!isUuid(seriesId)) {
    throw new CompanyFailure("COMPANY_DOCUMENT_SERIES_SELECTION_INVALID", "The selected document series identifier is invalid.");
  }
  return Object.freeze({ kind: "explicit", seriesId });
}
function isUuid(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
