"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import { getSupabaseBrowser } from "@/src/shared/frontend/utils/supabase-browser";
import { BaseButton } from "@/src/shared/frontend/components/base-button";

export default function ProfilePage() {
    const { user } = useAuth();

    const [name,       setName]       = useState("");
    const [nameLoaded, setNameLoaded] = useState(false);
    const [saving,     setSaving]     = useState(false);
    const [error,      setError]      = useState<string | null>(null);
    const [success,    setSuccess]    = useState(false);
    const [avatarUrl,  setAvatarUrl]  = useState<string | null>(null);
    const [uploading,  setUploading]  = useState(false);

    const fileRef = useRef<HTMLInputElement>(null);

    // Load current profile once user is available
    if (user && !nameLoaded) {
        setNameLoaded(true);
        fetch(`/api/users/get-by-id?id=${user.id}`)
            .then((r) => r.json())
            .then((r) => {
                if (r.data) {
                    setName(r.data.name ?? "");
                    setAvatarUrl(r.data.avatarUrl ?? null);
                }
            })
            .catch(() => {});
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (!user) return;
        setSaving(true);
        setError(null);
        setSuccess(false);
        const res  = await fetch("/api/users/update", {
            method:  "PATCH",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ id: user.id, data: { name: name.trim() } }),
        });
        const json = await res.json();
        setSaving(false);
        if (!res.ok) { setError(json.error ?? "Error al guardar"); return; }
        setSuccess(true);
    }

    async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file || !user) return;
        setUploading(true);
        setError(null);

        const supabase  = getSupabaseBrowser();
        const ext       = file.name.split(".").pop();
        const path      = `${user.id}/${Date.now()}.${ext}`;

        const { error: uploadErr } = await supabase.storage
            .from("avatars")
            .upload(path, file, { upsert: true });

        if (uploadErr) {
            setError("Error al subir imagen: " + uploadErr.message);
            setUploading(false);
            return;
        }

        const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);

        const res  = await fetch("/api/users/update", {
            method:  "PATCH",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ id: user.id, data: { avatarUrl: publicUrl } }),
        });
        const json = await res.json();
        setUploading(false);

        if (!res.ok) { setError(json.error ?? "Error al guardar avatar"); return; }
        setAvatarUrl(publicUrl);
    }

    const inputCls = [
        "w-full h-10 px-3 rounded-lg border bg-surface-2 outline-none",
        "font-mono text-sm text-foreground placeholder:text-foreground/30",
        "border-border-light focus:border-primary-500/60 hover:border-border-medium transition-colors",
    ].join(" ");

    return (
        <div className="p-4 sm:p-8 max-w-lg font-mono">
            <h1 className="text-sm font-semibold text-foreground mb-6">Perfil</h1>

            {/* Avatar */}
            <div className="flex items-center gap-4 mb-8">
                <div
                    onClick={() => fileRef.current?.click()}
                    className="w-16 h-16 rounded-full overflow-hidden bg-primary-500/10 flex items-center justify-center cursor-pointer border-2 border-border-light hover:border-primary-500/40 transition-colors"
                >
                    {avatarUrl ? (
                        <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                        <span className="font-mono text-xl font-bold text-primary-400 uppercase">
                            {(user?.email?.[0] ?? "?").toUpperCase()}
                        </span>
                    )}
                </div>
                <div>
                    <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className="font-mono text-xs text-primary-400 hover:text-primary-300 disabled:opacity-40 transition-colors"
                    >
                        {uploading ? "Subiendo…" : "Cambiar foto"}
                    </button>
                    <p className="font-mono text-[10px] text-foreground/30 mt-0.5">JPG, PNG o WebP. Máx 2 MB.</p>
                </div>
                <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={handleAvatarChange}
                />
            </div>

            {/* Form */}
            <form onSubmit={handleSave} className="space-y-5">
                <div>
                    <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/40 mb-1.5">
                        Correo electrónico
                    </label>
                    <input
                        type="text"
                        readOnly
                        value={user?.email ?? ""}
                        className={[inputCls, "opacity-50 cursor-default"].join(" ")}
                    />
                </div>

                <div>
                    <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/40 mb-1.5">
                        Nombre
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => { setName(e.target.value); setSuccess(false); }}
                        placeholder="Tu nombre completo"
                        className={inputCls}
                    />
                </div>

                {error && (
                    <p className="font-mono text-xs text-red-500">{error}</p>
                )}
                {success && (
                    <p className="font-mono text-xs text-green-500">Guardado correctamente.</p>
                )}

                <BaseButton.Root
                    type="submit"
                    variant="primary"
                    size="lg"
                    isDisabled={saving}
                    loading={saving}
                >
                    {saving ? "Guardando…" : "Guardar cambios"}
                </BaseButton.Root>
            </form>
        </div>
    );
}
