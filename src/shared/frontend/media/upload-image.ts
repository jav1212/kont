import { apiFetch } from "@/src/shared/frontend/utils/api-fetch";

/**
 * Uploads an image through the terminal-aware Web API.
 * @param file - Raster image selected by the user.
 * @param purpose - Authorized destination, without a caller-controlled object path.
 * @returns The URL to persist in the user's profile or company record.
 * @throws Error when the server rejects the image or the session is no longer valid.
 */
export async function uploadWebImage(file: File, purpose: "avatar" | "logo"): Promise<string> {
    const form = new FormData();
    form.set("file", file);
    form.set("purpose", purpose);
    const response = await apiFetch("/api/media/image", { method: "POST", body: form });
    const body = await response.json() as { data?: { publicUrl: string }; error?: string };
    if (!response.ok || !body.data) throw new Error(body.error ?? "No se pudo subir la imagen.");
    return body.data.publicUrl;
}
