import { ProductFailure } from "@kontave/products/domain";
import type { ProductCustomFieldDefinition } from "@kontave/products/domain";
import { resolveCanonicalTenantAuthorization, withTenantPermission } from "@/src/shared/backend/utils/require-tenant";
import { createWebProductCustomFieldsActions } from "@/src/modules/inventory/backend/product-custom-fields-web";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { z } from "zod";

const companyQuery = z.string().trim().min(1).max(128);
const definition = z.discriminatedUnion("type", [
  z.object({ id: z.string(), label: z.string(), type: z.literal("text"), required: z.boolean(), maxLength: z.number().int() }),
  z.object({ id: z.string(), label: z.string(), type: z.literal("number"), required: z.boolean(), minimum: z.number().nullable(), maximum: z.number().nullable() }),
  z.object({ id: z.string(), label: z.string(), type: z.union([z.literal("boolean"), z.literal("date")]), required: z.boolean() }),
  z.object({ id: z.string(), label: z.string(), type: z.literal("select"), required: z.boolean(), options: z.array(z.string()) }),
]);
const replaceInput = z.object({ companyId: companyQuery, expectedVersion: z.number().int().nonnegative(), definitions: z.array(definition) });

/**
 * Reads the typed, versioned custom-field catalog for one company.
 * @param request - Authenticated request with the companyId query parameter.
 * @returns A catalog response, or an expected authorization, validation, or persistence error.
 * @throws Expected tenant failures are translated by the route wrapper.
 */
export const GET = withTenantPermission("inventory.read", async (request, tenant) => {
  const companyValue = companyQuery.safeParse(new URL(request.url).searchParams.get("companyId"));
  if (!companyValue.success) return Response.json({ error: "Empresa inválida." }, { status: 400 });
  const actions = await actionsFor(tenant, companyValue.data);
  if (!actions) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
  try {
    return Response.json({ data: await actions.getCatalog.execute(actions.context(companyValue.data)) });
  } catch (cause) { return productFailure(cause, "consultar"); }
});

/**
 * Replaces typed definitions using the catalog revision supplied by the client.
 * @param request - Authenticated request containing scoped definitions and expectedVersion.
 * @returns The authoritative catalog or a compare-and-swap conflict response.
 * @throws Expected tenant failures are translated by the route wrapper.
 */
export const PUT = withTenantPermission("inventory.update", async (request, tenant) => {
  const input = replaceInput.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Definiciones de campos inválidas." }, { status: 400 });
  const actions = await actionsFor(tenant, input.data.companyId);
  if (!actions) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
  try {
    return Response.json({ data: await actions.replaceCatalog.execute({
      ...actions.context(input.data.companyId), expectedVersion: input.data.expectedVersion,
      definitions: input.data.definitions as readonly ProductCustomFieldDefinition[],
    }) });
  } catch (cause) { return productFailure(cause, "guardar"); }
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

function productFailure(cause: unknown, action: string): Response {
  if (cause instanceof ProductFailure) return Response.json({ error: cause.message, code: cause.code }, {
    status: cause.code.includes("VERSION_CONFLICT") ? 409 : cause.code === "PRODUCT_ACCESS_DENIED" ? 403 : cause.code === "PRODUCT_REPOSITORY_UNAVAILABLE" ? 503 : 422,
  });
  console.error("inventory.product_custom_fields.failed", { action, cause });
  return Response.json({ error: `No fue posible ${action} los campos personalizados.` }, { status: 500 });
}
