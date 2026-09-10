import { randomUUID } from "node:crypto";
import { Result } from "@/src/core/domain/result";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";

interface ImageStorage {
    put(bucket: "avatars" | "logos", path: string, bytes: Uint8Array, contentType: string): Promise<string>;
}

/** A server-authorized image upload whose path cannot be chosen by a browser. */
export interface UploadImageInput {
    readonly userId: string;
    readonly tenantId: string;
    readonly purpose: "avatar" | "logo";
    readonly bytes: Uint8Array;
}

/**
 * Recognizes supported raster signatures instead of trusting browser MIME labels.
 * @param bytes - Uploaded content, bounded by the route before allocation.
 * @returns A safe image extension/content type, or null for unsupported content.
 */
export function identifyImage(bytes: Uint8Array): { extension: string; contentType: string } | null {
    if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v)) return { extension: "png", contentType: "image/png" };
    if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { extension: "jpg", contentType: "image/jpeg" };
    if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0,4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8,12)) === "WEBP") return { extension: "webp", contentType: "image/webp" };
    return null;
}

class UploadImage {
    /**
     * Supplies the server-only storage adapter used after route authorization.
     * @param storage - Storage port restricted to public avatar/logo destinations.
     */
    constructor(private readonly storage: ImageStorage) {}

    /**
     * Stores a bounded raster under the authenticated user's tenant scope.
     * @param input - Identity authorized by the route and bounded uploaded bytes.
     * @returns Public image URL, or a safe validation/storage failure.
     */
    async execute(input: UploadImageInput): Promise<Result<string>> {
        const format = identifyImage(input.bytes);
        if (!format || input.bytes.length > 2 * 1024 * 1024) return Result.fail("Usa una imagen PNG, JPEG o WebP de hasta 2 MB.");
        const bucket = input.purpose === "avatar" ? "avatars" : "logos";
        const path = `${input.userId}/${input.tenantId}/${randomUUID()}.${format.extension}`;
        try {
            return Result.success(await this.storage.put(bucket, path, input.bytes, format.contentType));
        } catch {
            return Result.fail("No se pudo guardar la imagen. Intenta nuevamente.");
        }
    }
}

/**
 * Creates the server-only image use case and its Supabase storage adapter.
 * @returns Actions that never expose storage credentials to the browser.
 */
export function getImageUploadActions(): { upload: UploadImage } {
    return { upload: new UploadImage({
        async put(bucket, path, bytes, contentType) {
            const source = new ServerSupabaseSource().instance;
            const { error } = await source.storage.from(bucket).upload(path, bytes, { contentType, upsert: false });
            if (error) throw new Error("image_upload_failed");
            return source.storage.from(bucket).getPublicUrl(path).data.publicUrl;
        },
    }) };
}
