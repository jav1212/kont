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
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <div className="max-w-4xl w-full mx-auto px-6 py-10">
                
                {/* Header */}
                <header className="mb-10">
                    <h1 className="text-2xl font-bold text-foreground mb-2">Mi Perfil</h1>
                    <p className="text-sm text-foreground/40 font-mono">
                        Gestiona tu información personal, foto de perfil y preferencias.
                    </p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Avatar & Info */}
                    <div className="lg:col-span-2 space-y-8">
                        
                        {/* Profile Info Card */}
                        <section className="bg-surface-1 border border-border-light rounded-2xl overflow-hidden shadow-sm">
                            <div className="h-24 bg-gradient-to-r from-primary-500/10 to-primary-500/5" />
                            
                            <div className="px-8 pb-8">
                                {/* Avatar overlapping header */}
                                <div className="relative -mt-12 mb-6 flex items-end gap-5">
                                    <div
                                        onClick={() => fileRef.current?.click()}
                                        className="w-24 h-24 rounded-full overflow-hidden bg-surface-1 p-1 ring-4 ring-surface-1 shadow-lg cursor-pointer group"
                                    >
                                        <div className="w-full h-full rounded-full overflow-hidden bg-primary-500/10 flex items-center justify-center relative">
                                            {avatarUrl ? (
                                                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
                                            ) : (
                                                <span className="font-mono text-3xl font-bold text-primary-400 uppercase">
                                                    {(user?.email?.[0] ?? "?").toUpperCase()}
                                                </span>
                                            )}
                                            {/* Hover overlay */}
                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="pb-1">
                                        <h2 className="text-lg font-bold text-foreground truncate max-w-[200px]">
                                            {name || "Usuario"}
                                        </h2>
                                        <p className="text-xs text-foreground/40 font-mono lower">
                                            {user?.email}
                                        </p>
                                    </div>
                                </div>

                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="sr-only"
                                    onChange={handleAvatarChange}
                                />

                                {/* Form */}
                                <form onSubmit={handleSave} className="space-y-6 pt-2">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                        <div className="space-y-1.5">
                                            <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/40">
                                                Nombre Completo
                                            </label>
                                            <input
                                                type="text"
                                                value={name}
                                                onChange={(e) => { setName(e.target.value); setSuccess(false); }}
                                                placeholder="Tu nombre completo"
                                                className={inputCls}
                                            />
                                        </div>
                                        <div className="space-y-1.5 opacity-60">
                                            <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/40">
                                                Correo Electrónico
                                            </label>
                                            <input
                                                type="text"
                                                readOnly
                                                value={user?.email ?? ""}
                                                className={[inputCls, "cursor-default ring-0"].join(" ")}
                                            />
                                        </div>
                                    </div>

                                    {error && (
                                        <p className="font-mono text-xs text-red-500 bg-red-500/5 p-3 rounded-lg border border-red-500/20">{error}</p>
                                    )}
                                    {success && (
                                        <p className="font-mono text-xs text-green-500 bg-green-500/5 p-3 rounded-lg border border-green-500/20">Perfil actualizado correctamente.</p>
                                    )}
                                    {uploading && (
                                        <p className="font-mono text-xs text-primary-400 animate-pulse">Subiendo nueva imagen de perfil...</p>
                                    )}

                                    <div className="pt-4 flex justify-end">
                                        <BaseButton.Root
                                            type="submit"
                                            variant="primary"
                                            size="md"
                                            isDisabled={saving || uploading}
                                            loading={saving}
                                            className="min-w-[140px]"
                                        >
                                            Guardar Cambios
                                        </BaseButton.Root>
                                    </div>
                                </form>
                            </div>
                        </section>
                    </div>

                    {/* Right Column: Status & Level */}
                    <div className="space-y-6">
                        <section className="bg-surface-1 border border-border-light rounded-2xl p-6 shadow-sm">
                            <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/40 mb-4 px-1">
                                Estado de Cuenta
                            </h3>
                            
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 border border-border-light">
                                    <div className="w-10 h-10 rounded-full bg-primary-500/10 flex items-center justify-center text-primary-500">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-foreground">Nivel Silver</p>
                                        <p className="text-[10px] text-foreground/30 font-mono uppercase tracking-wider">Cliente Verificado</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 border border-border-light">
                                    <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-500">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-foreground">Autenticado</p>
                                        <p className="text-[10px] text-foreground/30 font-mono uppercase tracking-wider">Acceso Seguro</p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6 pt-6 border-t border-border-light">
                                <p className="text-[10px] text-foreground/30 leading-relaxed font-mono uppercase tracking-wider">
                                    Tu perfil es privado y solo visible para ti en Konta.
                                </p>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}
