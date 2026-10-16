import assert from "node:assert/strict";
import test from "node:test";
import { organizationId, userId } from "@kontave/organizations/domain";
import {
  CompanyAdministrationOperation,
  CompanyAdministrationPermission,
  ConfigureCompanyDateFormat,
  GetCompanyDateFormat,
  type CompanyAdministrationAuthorization,
} from "../../src/application";
import { CompanyFailure, companyDateFormat, companyId, formatCompanyDate, parseCompanyDate, parseIsoCalendarDate } from "../../src/domain";
import { InMemoryCompanyDateFormatRepository } from "../../src/testing";

const actor = userId("actor-a");
const organization = organizationId("organization-a");
const company = companyId("company-a");
const authorization: CompanyAdministrationAuthorization = {
  async assertCanManageCompanies() {},
};

function command(overrides: Partial<Parameters<ConfigureCompanyDateFormat["execute"]>[0]> = {}) {
  return {
    actorUserId: actor, organizationId: organization, companyId: company,
    expectedFormatVersion: 0, idempotencyKey: "date-format-1", reason: "Initial date convention", dateOrder: "day_first" as const,
    ...overrides,
  };
}

test("date-only display accepts strict real ISO dates and never observes a timezone", () => {
  assert.equal(formatCompanyDate("2026-09-28", "day_first"), "28/09/2026");
  assert.equal(formatCompanyDate("2026-09-28", "year_first"), "2026-09-28");
  assert.equal(formatCompanyDate("2026-09-28", "month_first"), "09/28/2026");
  assert.deepEqual(parseIsoCalendarDate("2024-02-29"), { year: "2024", month: "02", day: "29" });
  for (const value of ["2026-02-29", "2025-04-31", "0000-02-29", "2026-2-03", "2026-09-28T00:00:00Z", null]) {
    assert.throws(() => formatCompanyDate(value as never, "day_first"), failure("COMPANY_DATE_FORMAT_INVALID"));
  }
  assert.throws(() => companyDateFormat(null as never), failure("COMPANY_DATE_FORMAT_INVALID"));
});

test("company date input round-trips only through its explicit configured order", () => {
  for (const [isoDate, order] of [
    ["2026-09-28", "day_first"],
    ["2024-02-29", "month_first"],
    ["2000-02-29", "year_first"],
  ] as const) {
    assert.equal(parseCompanyDate(formatCompanyDate(isoDate, order), order), isoDate);
  }

  assert.equal(parseCompanyDate("03/04/2026", "day_first"), "2026-04-03");
  assert.equal(parseCompanyDate("03/04/2026", "month_first"), "2026-03-04");
});

test("company date input rejects non-exact, non-Gregorian, and invalid-order values", () => {
  for (const [input, order] of [
    [" 03/04/2026", "day_first"],
    ["03/04/2026 ", "day_first"],
    ["3/04/2026", "day_first"],
    ["03-04-2026", "day_first"],
    ["2026/04/03", "year_first"],
    ["29/02/1900", "day_first"],
    ["29/02/2026", "day_first"],
    ["00/02/2026", "day_first"],
    ["03/04/0000", "day_first"],
  ] as const) {
    assert.throws(() => parseCompanyDate(input, order), failure("COMPANY_DATE_FORMAT_INVALID"));
  }
  assert.throws(() => parseCompanyDate("03/04/2026", "locale_default" as never), failure("COMPANY_DATE_FORMAT_INVALID"));
});

test("date formats are explicit, revisioned, idempotent, and retrievable as immutable history", async () => {
  const repository = new InMemoryCompanyDateFormatRepository();
  const configure = new ConfigureCompanyDateFormat(authorization, repository);
  const first = await configure.execute(command());
  assert.equal(first.version, 1);
  assert.equal((await new GetCompanyDateFormat(authorization, repository).execute({ actorUserId: actor, organizationId: organization, companyId: company }))?.dateOrder, "day_first");
  assert.equal((await configure.execute(command())).version, 1);
  await assert.rejects(() => configure.execute(command({ reason: "Another reason" })), failure("COMPANY_DATE_FORMAT_IDEMPOTENCY_CONFLICT"));
  const second = await configure.execute(command({ expectedFormatVersion: 1, idempotencyKey: "date-format-2", reason: "US partner output", dateOrder: "month_first" }));
  assert.equal(second.version, 2);
  const historical = await new GetCompanyDateFormat(authorization, repository).execute({ actorUserId: actor, organizationId: organization, companyId: company, formatVersion: 1 });
  assert.equal(historical?.dateOrder, "day_first");
});

test("date configuration validates input and authorizes before persistence", async () => {
  const repository = new InMemoryCompanyDateFormatRepository();
  const denied: CompanyAdministrationAuthorization = { async assertCanManageCompanies() { throw new CompanyFailure("COMPANY_ACCESS_DENIED", "Denied."); } };
  await assert.rejects(() => new ConfigureCompanyDateFormat(denied, repository).execute(command()), failure("COMPANY_ACCESS_DENIED"));
  await assert.rejects(() => new GetCompanyDateFormat(denied, repository).execute({ actorUserId: actor, organizationId: organization, companyId: company }), failure("COMPANY_ACCESS_DENIED"));
  const configure = new ConfigureCompanyDateFormat(authorization, repository);
  await assert.rejects(() => configure.execute(command({ expectedFormatVersion: -1 })), failure("COMPANY_DATE_FORMAT_INVALID"));
  await assert.rejects(() => configure.execute(command({ dateOrder: "invalid" as never })), failure("COMPANY_DATE_FORMAT_INVALID"));
  await assert.rejects(() => configure.execute(command({ idempotencyKey: " ", reason: " " })), failure("COMPANY_DATE_FORMAT_INVALID"));
});

test("date format concurrency detects stale independent revisions", async () => {
  const repository = new InMemoryCompanyDateFormatRepository();
  const configure = new ConfigureCompanyDateFormat(authorization, repository);
  await configure.execute(command());
  await configure.execute(command({ expectedFormatVersion: 1, idempotencyKey: "date-format-2", reason: "Year first", dateOrder: "year_first" }));
  await assert.rejects(() => configure.execute(command({ expectedFormatVersion: 1, idempotencyKey: "date-format-3", reason: "Stale", dateOrder: "month_first" })), failure("COMPANY_DATE_FORMAT_VERSION_CONFLICT"));
});

test("the operations retain their required company permissions", () => {
  assert.equal(CompanyAdministrationOperation.ReadDateFormat, "read_date_format");
  assert.equal(CompanyAdministrationOperation.ConfigureDateFormat, "configure_date_format");
  assert.equal(CompanyAdministrationPermission.Read, "companies.read");
  assert.equal(CompanyAdministrationPermission.Update, "companies.update");
});

function failure(code: string) {
  return (error: unknown) => error instanceof CompanyFailure && error.code === code;
}
