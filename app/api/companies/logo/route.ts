import { CompanyFailure, companyId, companyLogoUrl, type CompanyLogoContentType } from "@kontave/companies/domain";
import { getCompanyAdministrationWebContext } from "@/src/modules/companies/backend/administration-web";
import { withTenantPermission } from "@/src/shared/backend/utils/require-tenant";
import { z } from "zod";

const companyIdSchema = z.string().trim().min(1).max(128);
const removeSchema = z.object({ companyId: companyIdSchema, expectedVersion: z.number().int().nonnegative() });
const maxLogoBytes = 5 * 1024 * 1024;
const contentTypes = new Set<CompanyLogoContentType>(["image/png", "image/jpeg", "image/webp"]);

/**
 * Reads the selected company's logo URL and optimistic revision.
 * @param request - Authenticated request with companyId in its query string.
 * @returns Current logo reference and company version without changing storage.
 * @throws Tenant authorization and persistence failures are translated to HTTP responses.
 */
export const GET = withTenantPermission("companies.read", async (request, tenant) => {
  const parsedCompanyId = companyIdSchema.safeParse(new URL(request.url).searchParams.get("companyId"));
  if (!parsedCompanyId.success) return Response.json({ error: "Empresa inválida." }, { status: 400 });
  try {
    const context = await getCompanyAdministrationWebContext(tenant, parsedCompanyId.data);
    if (!context) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
    return Response.json({ data: { companyId: context.company.id, logoUrl: companyLogoUrl(context.company.logo_url), version: context.company.version } });
  } catch (cause) { return companyFailure(cause); }
});

/**
 * Uploads a verified company logo through the package's versioned application service.
 * @param request - Authenticated multipart request with companyId, expectedVersion and an image file.
 * @returns The saved public-read logo URL and new company version.
 * @throws Tenant authorization, image validation and storage failures are translated to HTTP responses.
 */
export const PUT = withTenantPermission("companies.update", async (request, tenant) => {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxLogoBytes + 64 * 1024) return Response.json({ error: "El archivo supera el límite de 5 MiB." }, { status: 413 });
  let form: FormData;
  try { form = await request.formData(); }
  catch { return Response.json({ error: "El formulario del logotipo no es válido." }, { status: 400 }); }
  const companyValue = companyIdSchema.safeParse(form.get("companyId"));
  const rawVersion = form.get("expectedVersion");
  const expectedVersion = z.number().int().nonnegative().safeParse(
    typeof rawVersion === "string" && /^\d+$/.test(rawVersion) ? Number(rawVersion) : Number.NaN,
  );
  const file = form.get("file");
  if (!companyValue.success || !expectedVersion.success || !(file instanceof File)) {
    return Response.json({ error: "Indica la empresa, la revisión y un archivo de imagen." }, { status: 400 });
  }
  if (file.size < 1 || file.size > maxLogoBytes || !contentTypes.has(file.type as CompanyLogoContentType)) {
    return Response.json({ error: "El logotipo debe ser PNG, JPEG o WebP y no superar 5 MiB." }, { status: 400 });
  }
  try {
    const context = await getCompanyAdministrationWebContext(tenant, companyValue.data);
    if (!context) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
    const updated = await context.actions.setLogo.execute({
      ...context.actions.scope(), companyId: companyId(context.company.id), expectedVersion: expectedVersion.data,
      file: { bytes: new Uint8Array(await file.arrayBuffer()), contentType: file.type as CompanyLogoContentType },
    });
    return Response.json({ data: { companyId: updated.id, logoUrl: updated.logoUrl, version: updated.version } });
  } catch (cause) { return companyFailure(cause); }
});

/**
 * Removes the current company logo with optimistic concurrency control.
 * @param request - Authenticated JSON request with companyId and expectedVersion.
 * @returns The cleared logo reference and new company version.
 * @throws Tenant authorization, persistence and concurrency failures are translated to HTTP responses.
 */
export const DELETE = withTenantPermission("companies.update", async (request, tenant) => {
  const input = removeSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Empresa o revisión inválida." }, { status: 400 });
  try {
    const context = await getCompanyAdministrationWebContext(tenant, input.data.companyId);
    if (!context) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
    const updated = await context.actions.setLogo.execute({
      ...context.actions.scope(), companyId: companyId(context.company.id), expectedVersion: input.data.expectedVersion, file: null,
    });
    return Response.json({ data: { companyId: updated.id, logoUrl: updated.logoUrl, version: updated.version } });
  } catch (cause) { return companyFailure(cause); }
});

function companyFailure(cause: unknown): Response {
  if (cause instanceof CompanyFailure) return Response.json({ error: cause.message, code: cause.code }, {
    status: cause.code.includes("VERSION_CONFLICT") ? 409
      : cause.code === "COMPANY_NOT_FOUND" ? 404
      : cause.code === "COMPANY_ACCESS_DENIED" ? 403
      : cause.code === "COMPANY_LOGO_STORAGE_UNAVAILABLE" ? 503
      : 422,
  });
  console.error("companies.logo.failed", { cause });
  return Response.json({ error: "No fue posible procesar el logotipo de la empresa." }, { status: 500 });
}
