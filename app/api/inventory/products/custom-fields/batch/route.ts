import { ProductFailure } from "@kontave/products/domain";
import { resolveCanonicalTenantAuthorization, withTenantPermission } from "@/src/shared/backend/utils/require-tenant";
import { createWebProductCustomFieldsActions } from "@/src/modules/inventory/backend/product-custom-fields-web";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { z } from "zod";

const inputSchema = z.object({
  companyId: z.string().trim().min(1).max(128),
  productIds: z.array(z.string().trim().min(1).max(128)).max(50),
});

/**
 * Reads typed custom-field values for up to 50 products visible to an authorized company member.
 * @param request - Authenticated request containing companyId and visible productIds.
 * @returns A map of product ID to validated typed values and their value revision.
 * @throws Expected tenant and product failures are translated to HTTP responses.
 */
export const POST = withTenantPermission("inventory.read", async (request, tenant) => {
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Productos inválidos." }, { status: 400 });
  const authorization = await resolveCanonicalTenantAuthorization(tenant);
  if (!authorization) return Response.json({ error: "Organización no encontrada." }, { status: 404 });
  const { data: company, error } = await new ServerSupabaseSource().instance.from("shared_companies").select("id")
    .eq("tenant_id", tenant.tenantId).eq("organization_id", authorization.organizationId).eq("id", input.data.companyId).maybeSingle();
  if (error) return Response.json({ error: "No fue posible validar la empresa." }, { status: 503 });
  if (!company) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
  const actions = createWebProductCustomFieldsActions({ tenant, canonicalOrganizationId: authorization.organizationId, authorization: authorization.actions.require });
  try {
    const data = await actions.getValuesByProductIds.execute(actions.context(input.data.companyId), input.data.productIds);
    return Response.json({ data });
  } catch (cause) {
    if (cause instanceof ProductFailure) return Response.json({ error: cause.message, code: cause.code }, {
      status: cause.code === "PRODUCT_ACCESS_DENIED" ? 403 : cause.code === "PRODUCT_REPOSITORY_UNAVAILABLE" ? 503 : 422,
    });
    console.error("inventory.product_custom_fields.batch_read_failed", { cause });
    return Response.json({ error: "No fue posible consultar los campos tipados." }, { status: 500 });
  }
});
