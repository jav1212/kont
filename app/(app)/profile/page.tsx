"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, ShieldCheck, Mail, User as UserIcon } from "lucide-react";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import { getSupabaseBrowser } from "@/src/shared/frontend/utils/supabase-browser";
import { PageHeader }  from "@/src/shared/frontend/components/page-header";
import { BaseButton }  from "@/src/shared/frontend/components/base-button";
import { BaseInput }   from "@/src/shared/frontend/components/base-input";
import { BaseBadge }   from "@/src/shared/frontend/components/base-badge";

export default function ProfilePage() {
    const { user } = useAuth();

    const [name,       setName]       = useState("");
    const [nameLoaded, setNameLoaded] = useState(false);
    const [saving,     setSaving]     = useState(false);
    const [error,      setError]      = useState<string | null>(null);
    const [success,    setSuccess]    = useState(false);
    const [avatarUrl,  setAvatarUrl]  = useState<string | null>(null);
    const [uploading,  setUploading]  = useState(false);
    const [createdAt,  setCreatedAt]  = useState<string | null>(null);

    const fileRef = useRef<HTMLInputElement>(null);

    if (user && !nameLoaded) {
        setNameLoaded(true);
        fetch(`/api/users/get-by-id?id=${user.id}`)
            .then((r) => r.json())
            .then((r) => {
                if (r.data) {
                    setName(r.data.name ?? "");
                    setAvatarUrl(r.data.avatarUrl ?? null);
                    setCreatedAt(r.data.createdAt ?? null);
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
        if (!res.ok) { setError(json.error ?? "Error al guardar."); return; }
        setSuccess(true);
    }

    async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file || !user) return;
        setUploading(true);
        setError(null);

        const supabase = getSupabaseBrowser();
        const ext      = file.name.split(".").pop();
        const path     = `${user.id}/${Date.now()}.${ext}`;

        const { error: uploadErr } = await supabase.storage
            .from("avatars")
            .upload(path, file, { upsert: true });

        if (uploadErr) {
            setError("No se pudo subir la imagen: " + uploadErr.message);
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

        if (!res.ok) { setError(json.error ?? "No se pudo guardar la nueva imagen."); return; }
        setAvatarUrl(publicUrl);
    }

    const initial      = (name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase();
    const displayName  = name.trim() || "Sin nombre";
    const createdLabel = createdAt
        ? new Date(createdAt).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" })
        : "—";
    return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-surface-2">
            <PageHeader
                title="Mi Perfil"
                subtitle="Información personal y preferencias de cuenta"
            />

            <div className="flex-1 overflow-y-auto px-6 py-8">
                <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* ── Datos personales ────────────────────────────── */}
                    <section className="lg:col-span-2 border border-border-light rounded-xl bg-surface-1 shadow-sm overflow-hidden">
                        <header className="px-5 py-3 border-b border-border-light bg-surface-2">
                            <h2 className="font-mono text-[12px] font-semibold text-foreground/70 uppercase tracking-[0.14em]">
                                Datos personales
                            </h2>
                        </header>

                        <div className="px-6 py-6">
                            <div className="flex items-center gap-5 pb-6 mb-6 border-b border-border-light">
                                <button
                                    type="button"
                                    onClick={() => fileRef.current?.click()}
                                    aria-label="Cambiar foto de perfil"
                                    className="relative w-20 h-20 rounded-full overflow-hidden border border-border-default bg-surface-2 flex items-center justify-center group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:ring-offset-1"
                                >
                                    {avatarUrl ? (
                                        <Image
                                            src={avatarUrl}
                                            alt="Avatar"
                                            fill
                                            unoptimized
                                            sizes="80px"
                                            className="object-cover"
                                        />
                                    ) : (
                                        <span className="font-mono text-2xl font-bold text-primary-500 uppercase tabular-nums">
                                            {initial}
                                        </span>
                                    )}
                                    <span className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                        <Camera size={18} strokeWidth={2} />
                                    </span>
                                </button>

                                <div className="min-w-0 flex-1">
                                    <p className="font-mono text-[15px] font-semibold text-foreground truncate">
                                        {displayName}
                                    </p>
                                    <p className="font-mono text-[12px] text-foreground/50 mt-0.5 truncate">
                                        {user?.email ?? "—"}
                                    </p>
                                    <p className="font-sans text-[12px] text-foreground/40 mt-2 leading-snug">
                                        Haz clic en la imagen para reemplazarla. Formatos JPG, PNG o WebP.
                                    </p>
                                </div>

                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="sr-only"
                                    onChange={handleAvatarChange}
                                />
                            </div>

                            <form onSubmit={handleSave} className="space-y-5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    <BaseInput.Field
                                        label="Nombre completo"
                                        placeholder="Tu nombre completo"
                                        value={name}
                                        onValueChange={(v) => { setName(v); setSuccess(false); }}
                                    />
                                    <BaseInput.Field
                                        label="Correo electrónico"
                                        value={user?.email ?? ""}
                                        isReadOnly
                                        helperText="El correo no puede modificarse desde el perfil."
                                    />
                                </div>

                                {error && (
                                    <div className="px-3 py-2 border rounded-lg badge-error">
                                        <p className="font-sans text-[12px] text-text-error leading-snug">
                                            {error}
                                        </p>
                                    </div>
                                )}
                                {success && !error && (
                                    <div className="px-3 py-2 border rounded-lg badge-success">
                                        <p className="font-sans text-[12px] text-text-success leading-snug">
                                            Perfil actualizado correctamente.
                                        </p>
                                    </div>
                                )}
                                {uploading && (
                                    <div className="px-3 py-2 border rounded-lg badge-info">
                                        <p className="font-sans text-[12px] text-text-info leading-snug">
                                            Subiendo nueva imagen de perfil…
                                        </p>
                                    </div>
                                )}

                                <div className="pt-1 flex justify-end">
                                    <BaseButton.Root
                                        type="submit"
                                        variant="primary"
                                        size="md"
                                        isDisabled={saving || uploading}
                                        loading={saving}
                                    >
                                        Guardar Cambios
                                    </BaseButton.Root>
                                </div>
                            </form>
                        </div>
                    </section>

                    {/* ── Estado de la cuenta ─────────────────────────── */}
                    <section className="border border-border-light rounded-xl bg-surface-1 shadow-sm overflow-hidden self-start">
                        <header className="px-5 py-3 border-b border-border-light bg-surface-2 flex items-center justify-between">
                            <h2 className="font-mono text-[12px] font-semibold text-foreground/70 uppercase tracking-[0.14em]">
                                Cuenta
                            </h2>
                            <BaseBadge variant="success" dot>Activa</BaseBadge>
                        </header>

                        <dl className="divide-y divide-border-light">
                            <MetaRow
                                icon={<Mail size={14} />}
                                label="Correo"
                                value={user?.email ?? "—"}
                            />
                            <MetaRow
                                icon={<UserIcon size={14} />}
                                label="Nombre"
                                value={displayName}
                            />
                            <MetaRow
                                icon={<ShieldCheck size={14} />}
                                label="Autenticación"
                                valueSlot={<BaseBadge variant="success" dot>Verificada</BaseBadge>}
                            />
                            <MetaRow
                                label="Miembro desde"
                                value={createdLabel}
                                mono
                            />
                        </dl>

                        <div className="px-5 py-3 border-t border-border-light bg-surface-2">
                            <p className="font-sans text-[12px] text-foreground/50 leading-snug">
                                Tu perfil es privado y solo visible para ti en Kontave.
                            </p>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}

// ─── Local building block: one row inside the "Cuenta" meta list ─────────────

interface MetaRowProps {
    icon?:      React.ReactNode;
    label:      string;
    value?:     string;
    valueSlot?: React.ReactNode;
    mono?:      boolean;
}

function MetaRow({ icon, label, value, valueSlot, mono = false }: MetaRowProps) {
    return (
        <div className="flex items-center justify-between gap-3 px-5 py-3">
            <dt className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground/50 min-w-0">
                {icon && <span className="text-foreground/40 flex-shrink-0">{icon}</span>}
                <span className="truncate">{label}</span>
            </dt>
            <dd className="flex-shrink-0 max-w-[60%]">
                {valueSlot ?? (
                    <span
                        className={[
                            "text-[12px] text-foreground truncate block text-right",
                            mono ? "font-mono tabular-nums" : "font-mono",
                        ].join(" ")}
                        title={value}
                    >
                        {value}
                    </span>
                )}
            </dd>
        </div>
    );
}
