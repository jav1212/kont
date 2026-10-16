import { ProductFailure, productId } from "@kontave/products/domain";
import { resolveCanonicalTenantAuthorization, withTenantPermission } from "@/src/shared/backend/utils/require-tenant";
import { createWebProductCustomFieldsActions } from "@/src/modules/inventory/backend/product-custom-fields-web";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { z } from "zod";

const readQuery = z.string().trim().min(1).max(128);
const valuesInput = z.object({ companyId: readQuery, expectedVersion: z.number().int().nonnegative(), values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])) });

/**
 * Reads typed additional values without exposing the legacy product JSONB payload.
 * @param request - Authenticated request with companyId and a product route parameter.
 * @returns The versioned typed values or an expected authorization, validation, or not-found response.
 * @throws Expected tenant failures are translated by the route wrapper.
 */
export const GET = withTenantPermission("inventory.read", async (request, tenant) => {
  const companyValue = readQuery.safeParse(new URL(request.url).searchParams.get("companyId"));
  if (!companyValue.success) return Response.json({ error: "Empresa inválida." }, { status: 400 });
  const actions = await actionsFor(tenant, companyValue.data);
  if (!actions) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
  try { return Response.json({ data: await actions.getValues.execute(actions.context(companyValue.data), productId(request.url.split("/").at(-2) ?? "")) }); }
  catch (cause) { return productFailure(cause); }
});

/**
 * Replaces typed additional values with compare-and-swap protection.
 * @param request - Authenticated request containing values and their expectedVersion.
 * @returns The authoritative value snapshot or an expected conflict response.
 * @throws Expected tenant failures are translated by the route wrapper.
 */
export const PUT = withTenantPermission("inventory.update", async (request, tenant) => {
  const input = valuesInput.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Valores de campos inválidos." }, { status: 400 });
  const actions = await actionsFor(tenant, input.data.companyId);
  if (!actions) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
  try { return Response.json({ data: await actions.updateValues.execute({ ...actions.context(input.data.companyId), productId: productId(request.url.split("/").at(-2) ?? ""), expectedVersion: input.data.expectedVersion, values: input.data.values }) }); }
  catch (cause) { return productFailure(cause); }
});

async function actionsFor(tenant: Parameters<typeof resolveCanonicalTenantAuthorization>[0], companyValue: string) {
  const authorization = await resolveCanonicalTenantAuthorization(tenant);
  if (!authorization) return null;
  const { data, error } = await new ServerSupabaseSource().instance.from("shared_companies").select("id")
    .eq("tenant_id", tenant.tenantId).eq("organization_id", authorization.organizationId).eq("id", companyValue).maybeSingle();
  if (error) throw new Error("No fue posible validar la empresa.");
  if (!data) return null;
  return createWebProductCustomFieldsActions({ tenant, canonicalOrganizationId: authorization.organizationId, authorization: authorization.actions.require });
}

function productFailure(cause: unknown): Response {
  if (cause instanceof ProductFailure) return Response.json({ error: cause.message, code: cause.code }, {
    status: cause.code.includes("VERSION_CONFLICT") ? 409 : cause.code === "PRODUCT_NOT_FOUND" ? 404 : cause.code === "PRODUCT_ACCESS_DENIED" ? 403 : cause.code === "PRODUCT_REPOSITORY_UNAVAILABLE" ? 503 : 422,
  });
  console.error("inventory.product_custom_field_values.failed", { cause });
  return Response.json({ error: "No fue posible guardar los campos personalizados." }, { status: 500 });
}
