import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";

const configuration = readConfiguration();

test("isolated inventory RPC fixture enforces tenant scope, optimistic concurrency, and creation atomicity", async () => {
  const sql = postgres(configuration.databaseUrl, { max: 3 });
  const operationId = `integration-${randomUUID()}`;
  const lineId = `line-${operationId}`;
  const atomicReference = `atomic-${operationId}`;
  let tenantId;
  try {
    const access =
      await sql`select public.native_products_assert_access(${configuration.actorUserId}::uuid, ${configuration.organizationId}::uuid, ${configuration.companyId}) as tenant_id`;
    tenantId = access[0]?.tenant_id;
    assert.ok(
      tenantId,
      "The authorized actor, organization, and company must resolve exactly one tenant.",
    );
    const product =
      await sql`select id, public.native_product_unit(measure_unit) as unit from public.shared_inventory_products where tenant_id = ${tenantId}::uuid and company_id = ${configuration.companyId} and id = ${configuration.productId} and active`;
    assert.equal(
      product.length,
      1,
      "The integration product must be active in the authorized tenant and company.",
    );
    assert.equal(
      product[0]?.unit,
      configuration.unit,
      "The first line must use the product's valid native unit before testing failure of the second line.",
    );

    await sql`insert into public.shared_inventory_operations (tenant_id, id, company_id, reason, effective_date, source_kind, source_document_id, created_by) values (${tenantId}::uuid, ${operationId}, ${configuration.companyId}, 'opening_balance', '2026-08-16', 'inventory', ${operationId}, ${configuration.actorUserId}::uuid)`;
    await sql`insert into public.shared_inventory_operation_lines (tenant_id, operation_id, id, product_id, direction, quantity, unit) values (${tenantId}::uuid, ${operationId}, ${lineId}, ${configuration.productId}, 'inbound', 1, ${configuration.unit})`;

    const [first, second] = await Promise.allSettled([
      sql`select public.update_native_inventory_operation(${configuration.actorUserId}::uuid, ${configuration.organizationId}::uuid, ${configuration.companyId}, ${operationId}, 1, ${JSON.stringify({ reference: "concurrent-a" })}::jsonb)`,
      sql`select public.update_native_inventory_operation(${configuration.actorUserId}::uuid, ${configuration.organizationId}::uuid, ${configuration.companyId}, ${operationId}, 1, ${JSON.stringify({ reference: "concurrent-b" })}::jsonb)`,
    ]);
    assert.equal(
      [first, second].filter((result) => result.status === "fulfilled").length,
      1,
    );
    const conflict = [first, second].find(
      (result) => result.status === "rejected",
    );
    assert.equal(conflict?.status, "rejected");
    assert.match(
      String(conflict?.reason?.message),
      /INVENTORY_OPERATION_VERSION_CONFLICT/,
    );

    const state =
      await sql`select version, reference from public.shared_inventory_operations where tenant_id = ${tenantId}::uuid and id = ${operationId}`;
    assert.deepEqual(
      state.map(({ version }) => version),
      [2],
    );
    assert.ok(
      ["concurrent-a", "concurrent-b"].includes(state[0]?.reference ?? ""),
    );

    await assert.rejects(
      () =>
        sql`select public.get_native_inventory_operation(${configuration.actorUserId}::uuid, ${configuration.foreignOrganizationId}::uuid, ${configuration.foreignCompanyId}, ${operationId})`,
      (error) => /PRODUCT_ACCESS_DENIED/.test(String(error?.message)),
    );

    await assert.rejects(
      () =>
        sql`select public.create_native_inventory_operation(${configuration.actorUserId}::uuid, ${configuration.organizationId}::uuid, ${configuration.companyId}, 'opening_balance', '2026-08-16', ${atomicReference}, null, ${JSON.stringify(
          [
            {
              productId: configuration.productId,
              direction: "inbound",
              quantity: "1",
              unit: configuration.unit,
            },
            {
              productId: configuration.productId,
              direction: "inbound",
              quantity: "1",
              unit: "invalid-unit",
            },
          ],
        )}::jsonb)`,
      (error) => /INVENTORY_OPERATION_INVALID/.test(String(error?.message)),
    );
    const atomicState =
      await sql`select o.id, l.id as line_id from public.shared_inventory_operations o left join public.shared_inventory_operation_lines l on l.tenant_id = o.tenant_id and l.operation_id = o.id where o.tenant_id = ${tenantId}::uuid and o.company_id = ${configuration.companyId} and o.reference = ${atomicReference}`;
    assert.deepEqual(
      atomicState,
      [],
      "The invalid second line must roll back the operation and first line together.",
    );
  } finally {
    try {
      if (tenantId)
        await sql`delete from public.shared_inventory_operations where tenant_id = ${tenantId}::uuid and company_id = ${configuration.companyId} and (id = ${operationId} or reference = ${atomicReference})`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
});

function readConfiguration() {
  if (process.env.KONTAVE_INTEGRATION_ALLOW_DB !== "true")
    throw new Error(
      "Refusing integration database access: set KONTAVE_INTEGRATION_ALLOW_DB=true explicitly.",
    );
  const databaseUrl = process.env.KONTAVE_INTEGRATION_DATABASE_URL;
  const actorUserId = process.env.KONTAVE_INTEGRATION_ACTOR_USER_ID;
  const organizationId = process.env.KONTAVE_INTEGRATION_ORGANIZATION_ID;
  const foreignOrganizationId =
    process.env.KONTAVE_INTEGRATION_FOREIGN_ORGANIZATION_ID;
  const companyId = process.env.KONTAVE_INTEGRATION_COMPANY_ID;
  const foreignCompanyId = process.env.KONTAVE_INTEGRATION_FOREIGN_COMPANY_ID;
  const productId = process.env.KONTAVE_INTEGRATION_PRODUCT_ID;
  const unit = process.env.KONTAVE_INTEGRATION_PRODUCT_UNIT;
  if (
    !databaseUrl ||
    !actorUserId ||
    !organizationId ||
    !foreignOrganizationId ||
    !companyId ||
    !foreignCompanyId ||
    !productId ||
    !unit
  )
    throw new Error(
      "Set KONTAVE_INTEGRATION_DATABASE_URL, actor, organization, foreign organization/company, company, product, and product unit fixture variables.",
    );
  const parsedUrl = new URL(databaseUrl);
  const databaseName = parsedUrl.pathname.replace(/^\//, "");
  if (
    !["postgres:", "postgresql:"].includes(parsedUrl.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(parsedUrl.hostname) ||
    !/(?:^|[_-])test(?:[_-]|$)/i.test(databaseName)
  )
    throw new Error(
      "KONTAVE_INTEGRATION_DATABASE_URL must use PostgreSQL, loopback, and a database name containing 'test'.",
    );
  return {
    databaseUrl,
    actorUserId,
    organizationId,
    foreignOrganizationId,
    companyId,
    foreignCompanyId,
    productId,
    unit,
  };
}
