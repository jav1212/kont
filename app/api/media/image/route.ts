import { getImageUploadActions } from "@/src/modules/media/backend/upload-image";
import { requirePermission, requireTenant } from "@/src/shared/backend/utils/require-tenant";

/**
 * Uploads a raster through the same session/tenant guard as other Web operations.
 * @param request - Same-origin multipart request with purpose and file fields.
 * @returns A public URL or an authorization/validation failure; never a storage token.
 */
export async function POST(request: Request): Promise<Response> {
    if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Origen no permitido." }, { status: 403 });
    if (Number(request.headers.get("content-length")) > 2 * 1024 * 1024 + 8192) return Response.json({ error: "La imagen supera 2 MB." }, { status: 413 });
    try {
        const tenant = await requireTenant(request);
        const form = await request.formData();
        const purpose = form.get("purpose");
        const file = form.get("file");
        if ((purpose !== "avatar" && purpose !== "logo") || !(file instanceof File) || file.size > 2 * 1024 * 1024) {
            return Response.json({ error: "Imagen o propósito inválido." }, { status: 400 });
        }
        if (purpose === "logo") {
            try { await requirePermission(tenant, "companies.update", { req: request }); }
            catch { await requirePermission(tenant, "companies.create", { req: request }); }
        }
        const result = await getImageUploadActions().upload.execute({
            userId: tenant.userId, tenantId: tenant.tenantId, purpose,
            bytes: new Uint8Array(await file.arrayBuffer()),
        });
        return result.isSuccess
            ? Response.json({ data: { publicUrl: result.getValue() } }, { headers: { "Cache-Control": "no-store" } })
            : Response.json({ error: result.getError() }, { status: 400 });
    } catch {
        return Response.json({ error: "No se pudo autorizar la carga." }, { status: 403 });
    }
}
