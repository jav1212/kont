"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
    Gift,
    Users,
    CheckCircle2,
    Wallet,
    DollarSign,
    Copy,
    Share2,
    Link2,
} from "lucide-react";
import { useReferrals } from "@/src/modules/referrals/frontend/hooks/use-referrals";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { SettingsSection } from "@/src/shared/frontend/components/settings-section";

const Spinner = () => (
    <svg className="animate-spin text-[var(--text-tertiary)]" width="13" height="13" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
        <path d="M11 6A5 5 0 0 0 6 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

function formatUsd(n: number): string {
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ReferralsPage() {
    const { data, loading } = useReferrals();
    const [copiedCode, setCopiedCode] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);

    // `window` no existe en SSR, pero este es un client component ("use client")
    // así que cuando se renderiza ya está disponible.
    const origin   = typeof window === "undefined" ? "" : window.location.origin;
    const shareUrl = data?.referralCode ? `${origin}/sign-up?ref=${data.referralCode}` : "";

    async function handleCopyCode() {
        if (!data?.referralCode) return;
        try {
            await navigator.clipboard.writeText(data.referralCode);
            setCopiedCode(true);
            setTimeout(() => setCopiedCode(false), 1800);
        } catch { /* noop */ }
    }

    async function handleCopyLink() {
        if (!shareUrl) return;
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopiedLink(true);
            setTimeout(() => setCopiedLink(false), 1800);
        } catch { /* noop */ }
    }

    async function handleShare() {
        if (!shareUrl) return;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: "Únete a KONT",
                    text:  "Te invito a KONT, el sistema de nómina y contabilidad que uso. Regístrate con mi código:",
                    url:   shareUrl,
                });
            } catch { /* cancelado */ }
        } else {
            await handleCopyLink();
        }
    }

    return (
        <div className="space-y-6 font-mono">
            {loading ? (
                <SettingsSection title="Programa de referidos" subtitle="Cargando…">
                    <div className="flex flex-col items-center justify-center h-40 gap-3">
                        <Spinner />
                        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                            Cargando tu programa…
                        </span>
                    </div>
                </SettingsSection>
            ) : data && (
                <>
                    {/* ── Código + link ─────────────────────────────────────── */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-xl border border-primary-500/30 bg-primary-500/5 overflow-hidden shadow-sm shadow-primary-500/10"
                    >
                        <div className="px-6 py-4 flex items-center gap-3 border-b border-primary-500/20 bg-primary-500/[0.06]">
                            <div className="w-9 h-9 rounded-lg bg-primary-500/15 border border-primary-500/20 flex items-center justify-center text-primary-500 shrink-0">
                                <Gift size={16} />
                            </div>
                            <div className="min-w-0">
                                <p className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">Tu código de referido</p>
                                <p className="font-sans text-[12px] text-[var(--text-tertiary)] mt-0.5 leading-snug">
                                    Comparte este código o el enlace personalizado para que tus referidos queden vinculados a tu cuenta.
                                </p>
                            </div>
                        </div>

                        <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                            {/* Código */}
                            <div className="md:col-span-2 space-y-2">
                                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Código</p>
                                <div className="flex items-center gap-2">
                                    <div
                                        className="flex-1 h-12 px-4 rounded-lg bg-surface-1 border border-primary-500/20 flex items-center justify-center font-mono text-[22px] font-bold tracking-[0.3em] tabular-nums text-primary-500 select-all"
                                        aria-label="Código de referido"
                                    >
                                        {data.referralCode}
                                    </div>
                                    <BaseButton.Icon
                                        onClick={handleCopyCode}
                                        variant="outline"
                                        size="md"
                                        aria-label={copiedCode ? "Copiado" : "Copiar código"}
                                    >
                                        {copiedCode ? <CheckCircle2 size={16} className="text-primary-500" /> : <Copy size={16} />}
                                    </BaseButton.Icon>
                                </div>
                            </div>

                            {/* Link */}
                            <div className="md:col-span-3 space-y-2">
                                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Enlace de invitación</p>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-12 px-4 rounded-lg bg-surface-1 border border-border-light flex items-center gap-2 font-mono text-[12px] text-foreground truncate">
                                        <Link2 size={14} className="text-[var(--text-tertiary)] flex-shrink-0" />
                                        <span className="truncate" title={shareUrl}>{shareUrl}</span>
                                    </div>
                                    <BaseButton.Icon
                                        onClick={handleCopyLink}
                                        variant="outline"
                                        size="md"
                                        aria-label={copiedLink ? "Copiado" : "Copiar enlace"}
                                    >
                                        {copiedLink ? <CheckCircle2 size={16} className="text-primary-500" /> : <Copy size={16} />}
                                    </BaseButton.Icon>
                                    <BaseButton.Icon
                                        onClick={handleShare}
                                        variant="primary"
                                        size="md"
                                        aria-label="Compartir enlace"
                                    >
                                        <Share2 size={16} />
                                    </BaseButton.Icon>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* ── Stats ─────────────────────────────────────────────── */}
                    <SettingsSection
                        title="Tus métricas"
                        subtitle="Resumen de los referidos asociados a tu cuenta y el crédito acumulado."
                    >
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <StatCard
                                icon={<Users size={14} />}
                                label="Referidos"
                                value={data.stats.totalReferrals.toLocaleString("es-VE")}
                                hint="Cuentas creadas con tu código"
                            />
                            <StatCard
                                icon={<CheckCircle2 size={14} />}
                                label="Activados"
                                value={data.stats.activatedReferrals.toLocaleString("es-VE")}
                                hint="Con al menos un pago aprobado"
                            />
                            <StatCard
                                icon={<DollarSign size={14} />}
                                label="Total ganado"
                                value={`$${formatUsd(data.stats.totalEarnedUsd)}`}
                                hint="Crédito emitido total"
                            />
                            <StatCard
                                icon={<Wallet size={14} />}
                                label="Disponible"
                                value={`$${formatUsd(data.availableCreditUsd)}`}
                                highlight
                                hint="Se aplica a tu próxima factura"
                            />
                        </div>
                    </SettingsSection>

                    {/* ── How it works ──────────────────────────────────────── */}
                    <SettingsSection
                        title="Cómo funciona"
                        subtitle="Cuatro pasos. Sin trámites adicionales."
                    >
                        <ol className="space-y-3">
                            <Step n={1}>Comparte tu código o enlace con otro profesional o empresa.</Step>
                            <Step n={2}>Se registran usando tu enlace y quedan vinculados a tu cuenta.</Step>
                            <Step n={3}>Cuando realicen su <span className="font-bold text-foreground">primer pago aprobado</span>, recibes el <span className="font-bold text-primary-500">20%</span> del monto como crédito.</Step>
                            <Step n={4}>El crédito se aplica automáticamente a tus próximas facturas. Si sobra, queda disponible para la siguiente.</Step>
                        </ol>
                    </SettingsSection>
                </>
            )}
        </div>
    );
}

function StatCard({
    icon, label, value, hint, highlight,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    hint?: string;
    highlight?: boolean;
}) {
    return (
        <div className={[
            "rounded-xl border p-4 flex flex-col gap-2 transition-colors duration-150",
            highlight
                ? "border-primary-500/30 bg-primary-500/[0.06] shadow-sm shadow-primary-500/10"
                : "border-border-light bg-surface-2/30 hover:bg-surface-2/60",
        ].join(" ")}>
            <div className={[
                "flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em]",
                highlight ? "text-primary-500" : "text-[var(--text-tertiary)]",
            ].join(" ")}>
                {icon}
                {label}
            </div>
            <div className={[
                "font-mono text-[22px] font-bold tabular-nums",
                highlight ? "text-primary-500" : "text-foreground",
            ].join(" ")}>
                {value}
            </div>
            {hint && (
                <p className="font-sans text-[12px] text-[var(--text-tertiary)] leading-snug">
                    {hint}
                </p>
            )}
        </div>
    );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
    return (
        <li className="flex gap-3">
            <span className="w-5 h-5 rounded-full bg-primary-500/15 text-primary-500 flex items-center justify-center font-mono text-[11px] font-bold tabular-nums flex-shrink-0 mt-0.5">
                {n}
            </span>
            <span className="font-sans text-[13px] text-[var(--text-secondary)] leading-relaxed">{children}</span>
        </li>
    );
}
