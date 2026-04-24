"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { LogoMark, LogoFull } from "@/src/shared/frontend/components/logo";
import { BaseInput } from "@/src/shared/frontend/components/base-input";

// ============================================================================
// AUTH SHELL — split-view layout shared by sign-in / sign-up / forgot-password /
// reset-password / resend-confirmation / accept-invite.
//
// Left side  → form slot (logo + heading + form children)
// Right side → product-flavoured visual panel (orange gradient + mock receipt)
//
// The visual panel intentionally shows real product chrome — a floating recibo
// quincenal with tabular numbers and a BCV badge — instead of generic orbiting
// icons. Per konta-design: "the brand's visual story is its type scale + orange
// dot, nothing else." A mock receipt communicates that better than a ring of
// lucide glyphs and doubles as a preview of the app the user is about to enter.
// ============================================================================

interface AuthShellProps {
    children: ReactNode;
    visual?: ReactNode;
}

export function AuthShell({ children, visual }: AuthShellProps) {
    return (
        <div className="flex-1 flex flex-col md:flex-row min-h-0">
            {/* ── Form Side ────────────────────────────────────────────── */}
            <div className="flex-1 flex flex-col px-6 sm:px-8 py-10 md:py-14 lg:px-16 overflow-y-auto hidden-scrollbar">
                {/* Wordmark top-left — gives the user a way home on auth pages
                    (PublicHeader is hidden on auth routes). */}
                <div className="mb-10 md:mb-14 flex items-center">
                    <a href="/" className="hover:opacity-80 transition-opacity" aria-label="Volver al inicio">
                        <LogoFull size={26} className="text-foreground" />
                    </a>
                </div>

                <div className="flex-1 flex items-center justify-center">
                    <div className="w-full max-w-[380px]">
                        {children}
                    </div>
                </div>

                {/* Footer — plain mono, mirrors PublicFooter spacing */}
                <div className="mt-10 md:mt-14 flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-disabled)]">
                        © {new Date().getFullYear()} Kontave
                    </span>
                    <a
                        href="/herramientas/divisas"
                        className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-disabled)] hover:text-foreground transition-colors"
                    >
                        Tasa BCV →
                    </a>
                </div>
            </div>

            {/* ── Visual Side ──────────────────────────────────────────── */}
            <div className="hidden md:flex flex-1 relative p-4 lg:p-6 items-center justify-center">
                {visual ?? <AuthVisual />}
            </div>
        </div>
    );
}

// ============================================================================
// AUTH HEADER — logo tile + heading + subtitle stack used at top of forms.
// Centered or left-aligned depending on the `align` prop.
// ============================================================================

interface AuthHeaderProps {
    title:    ReactNode;
    subtitle?: ReactNode;
    align?:   "center" | "left";
    icon?:    ReactNode; // override the LogoMark tile (accept-invite, error states)
    iconTone?: "primary" | "neutral" | "danger";
}

export function AuthHeader({
    title,
    subtitle,
    align    = "center",
    icon,
    iconTone = "primary",
}: AuthHeaderProps) {
    const alignCls = align === "center" ? "items-center text-center" : "items-start text-left";

    const toneCls = {
        primary: "bg-primary-500 shadow-lg shadow-primary-500/30",
        neutral: "bg-surface-2 border border-border-default shadow-sm",
        danger:  "bg-red-500/10 border border-red-500/20 shadow-sm",
    }[iconTone];

    return (
        <div className={`flex flex-col ${alignCls} mb-9`}>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-5 ${toneCls}`}>
                {icon ?? <LogoMark size={22} className="text-white" />}
            </div>
            {/* Title uses sans (Darker Grotesque) for warmth on the marketing
                side of the product, matching the landing hero language. */}
            <h1 className="font-sans text-[28px] font-bold leading-tight tracking-[-0.02em] text-foreground">
                {title}
            </h1>
            {subtitle && (
                <p className={`font-sans text-[13.5px] text-text-tertiary leading-relaxed mt-2 ${align === "center" ? "max-w-[280px]" : ""}`}>
                    {subtitle}
                </p>
            )}
        </div>
    );
}

// ============================================================================
// AUTH VISUAL — product-flavoured panel for the right side.
//
// Anatomy:
//   1. Orange gradient plate with ambient glows + 40px grid pattern.
//   2. Floating "Recibo Quincenal" card (surface-1) — the Kontave signature:
//      mono UPPERCASE labels, tabular-nums, dual Bs./USD, right-aligned figures.
//   3. Floating BCV rate pill above-right — another product staple.
//   4. Decorative orbit ring behind the stack (subtle, not the focus).
//   5. Caption underneath.
//
// Each page can pass its own `heading` + `copy` — the card stays visually
// consistent so brand recognition compounds across auth routes.
// ============================================================================

interface AuthVisualProps {
    heading?: ReactNode;
    copy?:    ReactNode;
    /**
     * Optional override of the floating mock card. If omitted, the default
     * "Recibo Quincenal" card is rendered — which is the right call for most
     * pages. Only customize when context demands it (e.g. accept-invite could
     * show a team card instead).
     */
    mock?:    ReactNode;
}

export function AuthVisual({
    heading = <>Nómina, inventario y documentos<br /><span className="text-white/70">en una sola consola.</span></>,
    copy    = "Kontave integra cálculo quincenal, kardex y soportes contables con la tasa BCV actualizada en tiempo real.",
    mock,
}: AuthVisualProps) {
    return (
        <div className="w-full h-full rounded-[28px] relative overflow-hidden flex flex-col items-center justify-center bg-gradient-to-br from-primary-500 via-primary-600 to-orange-600">

            {/* Ambient light glows */}
            <div className="absolute top-[-25%] left-[-15%] w-[75%] h-[75%] rounded-full bg-white/10 blur-[90px] pointer-events-none" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-black/25 blur-[80px] pointer-events-none" />

            {/* 40px grid pattern — konta-design canonical */}
            <div
                className="absolute inset-0 opacity-[0.07] pointer-events-none"
                style={{
                    backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
                    backgroundSize:  "40px 40px",
                }}
            />

            {/* Decorative single orbit ring behind card */}
            <div aria-hidden className="absolute z-0 w-[520px] h-[520px] rounded-full border border-white/15" />
            <div aria-hidden className="absolute z-0 w-[340px] h-[340px] rounded-full border border-white/10" />

            {/* ── Floating mock stack ─────────────────────────────────── */}
            <div className="relative z-10 w-full max-w-md px-10 flex flex-col items-center">
                {mock ?? <ReciboMock />}

                {/* Caption */}
                <div className="mt-10 text-center max-w-sm">
                    <h2 className="font-sans text-white text-[24px] font-black leading-[1.15] tracking-[-0.02em] mb-3">
                        {heading}
                    </h2>
                    <p className="font-sans text-white/70 text-[13px] leading-relaxed">
                        {copy}
                    </p>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// PASSWORD FIELD — BaseInput.Field wrapper with show/hide toggle.
// Keeps the rest of the field styling (1px border-default, rounded-lg, mono)
// identical to every other input in the product.
// ============================================================================

interface PasswordFieldProps {
    label?:       string;
    placeholder?: string;
    value:        string;
    onValueChange: (v: string) => void;
    isDisabled?:  boolean;
    autoComplete?: string;
}

export function PasswordField({
    label,
    placeholder = "••••••••",
    value,
    onValueChange,
    isDisabled,
    autoComplete = "current-password",
}: PasswordFieldProps) {
    const [show, setShow] = useState(false);

    return (
        <BaseInput.Field
            label={label}
            type={show ? "text" : "password"}
            autoComplete={autoComplete}
            placeholder={placeholder}
            value={value}
            onValueChange={onValueChange}
            isDisabled={isDisabled}
            endContent={
                <button
                    type="button"
                    onClick={() => setShow(s => !s)}
                    disabled={isDisabled}
                    tabIndex={-1}
                    aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="flex items-center justify-center w-7 h-7 rounded-md text-text-tertiary hover:text-foreground hover:bg-surface-2 transition-colors disabled:opacity-40"
                >
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
            }
        />
    );
}

// ============================================================================
// RECIBO MOCK — the floating product fragment. Intentionally static. Shows the
// Kontave aesthetic: mono UPPERCASE labels, tabular figures, dual Bs./USD,
// right-aligned numerics, a tiny orange accent dot, and a BCV pill badge above.
// ============================================================================

function ReciboMock() {
    return (
        <div className="relative w-full flex flex-col items-center">
            {/* BCV pill — floats top-right over the receipt */}
            <div className="absolute -top-5 right-0 z-10 inline-flex items-center gap-2 px-3 h-8 rounded-full bg-white/95 border border-white/70 shadow-lg backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-700">BCV</span>
                <span className="font-mono text-[11px] tabular-nums font-bold text-neutral-900">79,59</span>
            </div>

            {/* Receipt card */}
            <div className="w-full rounded-2xl bg-white shadow-[0_20px_60px_-12px_rgba(8,9,16,0.45)] border border-white/60 overflow-hidden">
                {/* Header strip */}
                <div className="flex items-center justify-between px-4 h-9 bg-neutral-50 border-b border-neutral-200">
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-semibold">
                        Recibo · Q1 Abril
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-700 font-semibold">
                        Confirmado
                    </span>
                </div>

                {/* Body */}
                <div className="p-4 space-y-3">
                    {/* Employee row */}
                    <div className="flex items-center justify-between">
                        <div className="min-w-0">
                            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-400">Empleado</p>
                            <p className="font-mono text-[13px] font-semibold text-neutral-900 truncate">Juan C. Pérez</p>
                        </div>
                        <div className="text-right">
                            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-400">Cédula</p>
                            <p className="font-mono text-[12px] tabular-nums text-neutral-700">V-12.845.320</p>
                        </div>
                    </div>

                    {/* Line items */}
                    <div className="border-t border-neutral-200 pt-3 space-y-1.5">
                        {[
                            { label: "Salario Quincenal", ves: "13.250,00" },
                            { label: "Bono Asistencia",   ves: "1.500,00" },
                            { label: "IVSS (4%)",         ves: "-530,00", neg: true },
                        ].map(row => (
                            <div key={row.label} className="flex items-center justify-between">
                                <span className="font-mono text-[11px] text-neutral-600 tracking-[0.02em]">{row.label}</span>
                                <span className={`font-mono text-[12px] tabular-nums ${row.neg ? "text-red-600" : "text-neutral-900"}`}>
                                    {row.neg ? "" : "Bs. "}{row.ves}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Net total — orange accent */}
                    <div className="border-t border-neutral-200 pt-3">
                        <div className="flex items-end justify-between">
                            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 font-semibold pb-0.5">
                                Neto a Pagar
                            </span>
                            <div className="text-right">
                                <p className="font-mono text-[18px] tabular-nums font-bold text-neutral-900 leading-none tracking-[-0.01em]">
                                    Bs. 14.220<span className="text-primary-500">,00</span>
                                </p>
                                <p className="font-mono text-[11px] tabular-nums text-neutral-500 mt-1">
                                    $178,67 USD
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Secondary floating tile — subtle, just hints at other modules */}
            <div className="absolute -bottom-6 -left-2 w-[180px] rounded-xl bg-white/95 border border-white/60 shadow-lg backdrop-blur-sm p-3 hidden lg:block">
                <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-500 font-semibold">Kardex</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                </div>
                <p className="font-mono text-[13px] tabular-nums font-bold text-neutral-900 leading-tight">
                    248 <span className="text-[10px] text-neutral-500 font-normal">mov. mes</span>
                </p>
            </div>
        </div>
    );
}
