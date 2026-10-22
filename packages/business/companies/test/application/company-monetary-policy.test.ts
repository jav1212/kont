import assert from "node:assert/strict";
import test from "node:test";
import { organizationId, userId } from "@kontave/organizations/domain";
import { currency, exchangeRate, moneyFromDecimal, type ExchangeRateSnapshot } from "@kontave/monetary/domain";
import { FixedCurrencyCatalog, InMemoryExchangeRateCache, ResolveExchangeRates } from "@kontave/monetary/application";
import { MonitorBcvProvider, type Clock, type MonitorBcvTransport } from "@kontave/monetary/monitor-bcv";
import {
  ConfigureCompanyMonetaryPolicy,
  GetCompanyMonetaryPolicy,
  ResolveCompanyMonetaryContext,
  type CompanyAdministrationAuthorization,
  type CompanyExchangeRateResolver,
} from "../../src/application";
import { Company, CompanyCountry, CompanyFailure, CompanyStatus, companyId, convertWithCompanyMonetaryContext } from "../../src/domain";
import { InMemoryCompanyMonetaryPolicyRepository, InMemoryCompanyRepository } from "../../src/testing";

const organization = organizationId("organization-a");
const actor = userId("actor-a");
const company = companyId("company-a");
const authorization: CompanyAdministrationAuthorization = { async assertCanManageCompanies() {} };
const settings = {
  operatingCurrencyCode: currency("VES", 2).code,
  operatingCurrencyMinorUnit: 2,
  referenceCurrencyCodes: [currency("USD", 2).code],
  rateSource: "bcv" as const,
  roundingProfile: "commercial_v1" as const,
  allowPreviousAvailableDate: false as const,
  maxPreviousDays: 0 as const,
};

function command(overrides: Partial<Parameters<ConfigureCompanyMonetaryPolicy["execute"]>[0]> = {}) {
  return { actorUserId: actor, organizationId: organization, companyId: company, expectedPolicyVersion: 0, idempotencyKey: "monetary-1", reason: "Initial compatible policy", settings, ...overrides };
}

test("a monetary policy has independent revision and idempotent immutable history", async () => {
  const repository = new InMemoryCompanyMonetaryPolicyRepository();
  const configure = new ConfigureCompanyMonetaryPolicy(authorization, repository);
  const first = await configure.execute(command());
  const replay = await configure.execute(command());
  assert.equal(first.version, 1);
  assert.equal(replay, first);
  const orderedRepository = new InMemoryCompanyMonetaryPolicyRepository();
  const orderedConfigure = new ConfigureCompanyMonetaryPolicy(authorization, orderedRepository);
  const bothReferences = [currency("USD", 2).code, currency("EUR", 2).code];
  const ordered = await orderedConfigure.execute(command({ idempotencyKey: "canonical-order", settings: { ...settings, referenceCurrencyCodes: bothReferences } }));
  const reordered = await orderedConfigure.execute(command({ idempotencyKey: "canonical-order", settings: { ...settings, referenceCurrencyCodes: [...bothReferences].reverse() } }));
  assert.equal(reordered, ordered);
  await assert.rejects(() => configure.execute(command({ reason: "Different reason" })), failure("COMPANY_MONETARY_POLICY_IDEMPOTENCY_CONFLICT"));
  const second = await configure.execute(command({ expectedPolicyVersion: 1, idempotencyKey: "monetary-2", reason: "Reconfirm policy" }));
  assert.equal(second.version, 2);
  const get = new GetCompanyMonetaryPolicy(authorization, repository);
  assert.equal((await get.execute({ actorUserId: actor, organizationId: organization, companyId: company, policyVersion: 1 }))?.version, 1);
  await assert.rejects(() => get.execute({ actorUserId: actor, organizationId: organization, companyId: company, policyVersion: 99 }), failure("COMPANY_MONETARY_POLICY_REVISION_NOT_FOUND"));
});

test("policy setup validates source, compatibility profile, and configured references", async () => {
  const configure = new ConfigureCompanyMonetaryPolicy(authorization, new InMemoryCompanyMonetaryPolicyRepository());
  await assert.rejects(() => configure.execute(command({ settings: { ...settings, referenceCurrencyCodes: [] } })), failure("COMPANY_MONETARY_POLICY_INVALID"));
  await assert.rejects(() => configure.execute(command({ settings: { ...settings, allowPreviousAvailableDate: true as false } })), failure("COMPANY_MONETARY_POLICY_INVALID"));
  await assert.rejects(() => configure.execute(command({ settings: { ...settings, referenceCurrencyCodes: [currency("VES", 2).code] } })), failure("COMPANY_MONETARY_POLICY_INVALID"));
});

test("policy reads and changes authorize before persistence", async () => {
  const denied: CompanyAdministrationAuthorization = { async assertCanManageCompanies() { throw new CompanyFailure("COMPANY_ACCESS_DENIED", "Denied."); } };
  const repository = new InMemoryCompanyMonetaryPolicyRepository();
  await assert.rejects(() => new ConfigureCompanyMonetaryPolicy(denied, repository).execute(command()), failure("COMPANY_ACCESS_DENIED"));
  await assert.rejects(() => new GetCompanyMonetaryPolicy(denied, repository).execute({ actorUserId: actor, organizationId: organization, companyId: company }), failure("COMPANY_ACCESS_DENIED"));
});

test("resolver admits only fresh exact BCV USD-to-VES rates and preserves a reproducible snapshot", async () => {
  const policies = new InMemoryCompanyMonetaryPolicyRepository();
  await new ConfigureCompanyMonetaryPolicy(authorization, policies).execute(command());
  const companies = new InMemoryCompanyRepository([
    new Company({ id: company, organizationId: organization, legacyCompanyId: company, legalName: "Company A", tradeName: null, taxId: null, country: CompanyCountry.Venezuela, status: CompanyStatus.Active, version: 90 }),
  ]);
  const rates = composedBcvResolver();
  const resolve = new ResolveCompanyMonetaryContext(new GetCompanyMonetaryPolicy(authorization, policies), companies, rates);
  const snapshot = await resolve.execute({ actorUserId: actor, organizationId: organization, companyId: company, referenceCurrencyCode: currency("USD", 2).code, requestedDate: "2026-09-28" });
  assert.equal(convertWithCompanyMonetaryContext(moneyFromDecimal("1.00", currency("USD", 2)), JSON.parse(JSON.stringify(snapshot))).converted.minorAmount, 4250n);
  assert.equal(snapshot.policyVersion, 1);
  await new ConfigureCompanyMonetaryPolicy(authorization, policies).execute(command({ expectedPolicyVersion: 1, idempotencyKey: "monetary-2", reason: "Later policy revision", settings: { ...settings, referenceCurrencyCodes: [currency("EUR", 2).code] } }));
  assert.equal(convertWithCompanyMonetaryContext(moneyFromDecimal("1.00", currency("USD", 2)), snapshot).converted.minorAmount, 4250n);
  await assert.rejects(() => resolve.execute({ actorUserId: actor, organizationId: organization, companyId: company, referenceCurrencyCode: currency("USD", 2).code, requestedDate: "2026-09-28" }), failure("COMPANY_MONETARY_POLICY_INVALID"));
});

test("resolver does not create new contexts for a suspended company", async () => {
  const policies = new InMemoryCompanyMonetaryPolicyRepository();
  await new ConfigureCompanyMonetaryPolicy(authorization, policies).execute(command());
  const companies = new InMemoryCompanyRepository([
    new Company({ id: company, organizationId: organization, legacyCompanyId: company, legalName: "Company A", tradeName: null, taxId: null, country: CompanyCountry.Venezuela, status: CompanyStatus.Suspended, version: 1 }),
  ]);
  const rates: CompanyExchangeRateResolver = { async historical() { return resolvedRate(); } };
  const resolve = new ResolveCompanyMonetaryContext(new GetCompanyMonetaryPolicy(authorization, policies), companies, rates);
  await assert.rejects(() => resolve.execute({ actorUserId: actor, organizationId: organization, companyId: company, referenceCurrencyCode: currency("USD", 2).code, requestedDate: "2026-09-28" }), failure("COMPANY_NOT_OPERATIONAL"));
});

test("resolver rejects stale, prior-date and forged provider evidence", async () => {
  const policies = new InMemoryCompanyMonetaryPolicyRepository();
  await new ConfigureCompanyMonetaryPolicy(authorization, policies).execute(command());
  const companies = new InMemoryCompanyRepository([
    new Company({ id: company, organizationId: organization, legacyCompanyId: company, legalName: "Company A", tradeName: null, taxId: null, country: CompanyCountry.Venezuela, status: CompanyStatus.Active, version: 1 }),
  ]);
  for (const partial of [{ freshness: { kind: "stale" as const, retrievedAt: "2026-09-28T00:00:00.000Z", providerFailureAt: "2026-09-28T00:01:00.000Z" } }, { resolution: "previous_available_date" as const, effectiveDate: "2026-09-27" }, { rates: [{ ...rateSnapshot(), source: { kind: "official" as const, authority: "Other", reference: null } }] }]) {
    const rates: CompanyExchangeRateResolver = { async historical() { return { ...resolvedRate(), ...partial } as ReturnType<typeof resolvedRate>; } };
    const resolve = new ResolveCompanyMonetaryContext(new GetCompanyMonetaryPolicy(authorization, policies), companies, rates);
    await assert.rejects(() => resolve.execute({ actorUserId: actor, organizationId: organization, companyId: company, referenceCurrencyCode: currency("USD", 2).code, requestedDate: "2026-09-28" }), failure("COMPANY_MONETARY_POLICY_INVALID"));
  }
});

test("resolver reports an absent current policy and authorizes before inspecting company state", async () => {
  const companies = new InMemoryCompanyRepository();
  const resolveMissing = new ResolveCompanyMonetaryContext(new GetCompanyMonetaryPolicy(authorization, new InMemoryCompanyMonetaryPolicyRepository()), companies, { async historical() { return resolvedRate(); } });
  await assert.rejects(() => resolveMissing.execute({ actorUserId: actor, organizationId: organization, companyId: company, referenceCurrencyCode: currency("USD", 2).code, requestedDate: "2026-09-28" }), failure("COMPANY_MONETARY_POLICY_NOT_CONFIGURED"));
  let inspected = 0;
  const denied: CompanyAdministrationAuthorization = { async assertCanManageCompanies() { throw new CompanyFailure("COMPANY_ACCESS_DENIED", "Denied."); } };
  const spy = { async listByOrganization() { return []; }, async findById() { inspected++; return null; }, async save() {} };
  const resolveDenied = new ResolveCompanyMonetaryContext(new GetCompanyMonetaryPolicy(denied, new InMemoryCompanyMonetaryPolicyRepository()), spy, { async historical() { return resolvedRate(); } });
  await assert.rejects(() => resolveDenied.execute({ actorUserId: actor, organizationId: organization, companyId: company, referenceCurrencyCode: currency("USD", 2).code, requestedDate: "2026-09-28" }), failure("COMPANY_ACCESS_DENIED"));
  assert.equal(inspected, 0);
});

test("snapshot replay preserves published precision and half-up signed conversions", () => {
  const snapshot = snapshotFor("42.5000", 4);
  const replayed = convertWithCompanyMonetaryContext(moneyFromDecimal("1.00", currency("USD", 2)), snapshot);
  assert.equal(replayed.rate.publishedScale, 4);
  assert.equal(replayed.exactAmount, "42.5");
  const half = snapshotFor("1.5", 1);
  assert.equal(convertWithCompanyMonetaryContext(moneyFromDecimal("0.01", currency("USD", 2)), half).converted.minorAmount, 2n);
  assert.equal(convertWithCompanyMonetaryContext(moneyFromDecimal("-0.01", currency("USD", 2)), half).converted.minorAmount, -2n);
  const precise = convertWithCompanyMonetaryContext(moneyFromDecimal("1.00", currency("USD", 2)), snapshotFor("42.1234567890123", 13));
  assert.equal(precise.exactAmount, "42.1234567890123");
});

test("corrupted serialized snapshots consistently fail with a typed company error", () => {
  const valid = snapshotFor("42.5000", 4);
  const corruptions: unknown[] = [
    {},
    { ...valid, organizationId: "" }, { ...valid, companyId: " " },
    { ...valid, requestedDate: "2026-02-30" }, { ...valid, effectiveDate: "2026-02-30" },
    { ...valid, roundingMode: "half_even" }, { ...valid, rate: { ...valid.rate, baseCurrency: { ...valid.rate.baseCurrency, minorUnit: 3 } } },
    { ...valid, rate: { ...valid.rate, quoteCurrency: { ...valid.rate.quoteCurrency, minorUnit: 3 } } },
    { ...valid, referenceCurrency: { ...valid.referenceCurrency, minorUnit: 3 } },
    { ...valid, rate: { ...valid.rate, publishedScale: 1 } }, { ...valid, rate: { ...valid.rate, value: "NaN" } },
    { ...valid, rate: { ...valid.rate, value: "0" } }, { ...valid, rate: { ...valid.rate, value: "-1" } },
  ];
  for (const corrupted of corruptions) {
    assert.throws(() => convertWithCompanyMonetaryContext(moneyFromDecimal("1.00", currency("USD", 2)), corrupted as never), failure("COMPANY_MONETARY_POLICY_INVALID"));
  }
});

function rateSnapshot(): ExchangeRateSnapshot {
  return { rate: exchangeRate({ baseCurrency: currency("USD", 2), quoteCurrency: currency("VES", 2), value: "42.5000" }), effectiveDate: "2026-09-28", capturedAt: "2026-09-28T12:00:00.000Z", source: { kind: "official", authority: "BCV", reference: "monitor" } };
}
function resolvedRate() { return { requestedDate: "2026-09-28", effectiveDate: "2026-09-28", resolution: "exact_date" as const, observedAt: "2026-09-28T12:00:00.000Z", rates: [rateSnapshot()], freshness: { kind: "fresh" as const, retrievedAt: "2026-09-28T12:00:00.000Z" } }; }
function failure(code: string) { return (error: unknown) => error instanceof CompanyFailure && error.code === code; }

function composedBcvResolver(): CompanyExchangeRateResolver {
  const clock: Clock = { now: () => new Date("2026-09-28T12:00:00.000Z"), today: () => "2026-09-28" };
  const transport: MonitorBcvTransport = { async request() { return { status: 200, body: '[{"code":"USD","buy":"42.4","sell":"42.5000","date":"28/09/2026"}]' }; } };
  const provider = new MonitorBcvProvider(new FixedCurrencyCatalog([currency("USD", 2), currency("EUR", 2)]), currency("VES", 2), transport, { baseUrl: "https://provider.test", timeoutMilliseconds: 20, retryAttempts: 0, historicalLookbackDays: 0 }, clock);
  const resolver = new ResolveExchangeRates(provider, new InMemoryExchangeRateCache(), { currentTtlMilliseconds: 1_000, historicalTtlMilliseconds: 1_000, staleIfErrorMilliseconds: 0 }, () => new Date("2026-09-28T12:00:00.000Z"));
  return { historical: (quoteCurrency, date) => resolver.historical(quoteCurrency, date) };
}

function snapshotFor(value: string, publishedScale: number) {
  return {
    organizationId: "organization-a", companyId: "company-a", policyVersion: 1,
    operatingCurrency: { code: "VES", minorUnit: 2 }, referenceCurrency: { code: "USD", minorUnit: 2 },
    roundingProfile: "commercial_v1" as const, roundingMode: "half_up" as const,
    requestedDate: "2026-09-28", effectiveDate: "2026-09-28", observedAt: "2026-09-28T12:00:00.000Z",
    resolution: "exact_date" as const, freshness: { kind: "fresh" as const, retrievedAt: "2026-09-28T12:00:00.000Z" },
    rate: { baseCurrency: { code: "USD", minorUnit: 2 }, quoteCurrency: { code: "VES", minorUnit: 2 }, value, publishedScale, capturedAt: "2026-09-28T12:00:00.000Z", source: { kind: "official" as const, authority: "BCV", reference: "monitor" } },
  };
}
