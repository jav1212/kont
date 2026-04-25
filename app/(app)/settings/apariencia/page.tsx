"use client";

import { Sun, Moon, Check } from "lucide-react";
import { useTheme } from "@/src/shared/frontend/components/theme-provider";
import { SettingsSection } from "@/src/shared/frontend/components/settings-section";

type Mode = "light" | "dark";

export default function AparienciaPage() {
    const { theme, setTheme } = useTheme();

    return (
        <div className="space-y-6">
            <SettingsSection
                title="Tema de la aplicación"
                subtitle="Estos ajustes se guardan localmente en tu navegador y no afectan a otros miembros del tenant."
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <ThemeOption
                        mode="light"
                        active={theme === "light"}
                        icon={<Sun size={13} strokeWidth={2.5} />}
                        label="Modo claro"
                        helper="Fondos claros, ideal para luz de día."
                        onSelect={() => setTheme("light")}
                    />
                    <ThemeOption
                        mode="dark"
                        active={theme === "dark"}
                        icon={<Moon size={13} strokeWidth={2.5} />}
                        label="Modo oscuro"
                        helper="Fondos oscuros, recomendado para jornadas largas."
                        onSelect={() => setTheme("dark")}
                    />
                </div>
            </SettingsSection>
        </div>
    );
}

// ── Theme option tile ────────────────────────────────────────────────────────

function ThemeOption({
    mode,
    active,
    icon,
    label,
    helper,
    onSelect,
}: {
    mode:     Mode;
    active:   boolean;
    icon:     React.ReactNode;
    label:    string;
    helper:   string;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            aria-pressed={active}
            className={[
                "group text-left flex flex-col rounded-xl border transition-colors duration-150 overflow-hidden",
                active
                    ? "border-primary-500/50 ring-2 ring-primary-500/20 bg-primary-500/[0.04]"
                    : "border-border-light bg-surface-1 hover:border-border-medium",
            ].join(" ")}
        >
            <ThemePreview mode={mode} />
            <div className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={active ? "text-primary-500" : "text-[var(--text-tertiary)]"}>
                            {icon}
                        </span>
                        <p className={[
                            "font-mono text-[12px] font-bold uppercase tracking-[0.14em]",
                            active ? "text-primary-500" : "text-foreground",
                        ].join(" ")}>
                            {label}
                        </p>
                    </div>
                    <p className="font-sans text-[12px] text-[var(--text-tertiary)] mt-1 leading-snug">
                        {helper}
                    </p>
                </div>
                <span
                    aria-hidden="true"
                    className={[
                        "shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-colors duration-150",
                        active
                            ? "bg-primary-500 border-primary-500 text-white"
                            : "bg-surface-2 border-border-default text-transparent group-hover:border-border-strong",
                    ].join(" ")}
                >
                    <Check size={12} strokeWidth={3} />
                </span>
            </div>
        </button>
    );
}

// ── Mini-mock that forces hex colors so it renders correctly regardless of
//    the page's current theme. Light tile = light KONT, dark tile = dark KONT.
// ──────────────────────────────────────────────────────────────────────────

function ThemePreview({ mode }: { mode: Mode }) {
    const c = mode === "light"
        ? {
            bg:        "#EEF0F7",   // background
            surface:   "#FFFFFF",   // surface-1
            surface2:  "#E8EBF5",   // surface-2
            border:    "#BDC4D8",   // border-light
            text:      "#111525",   // foreground
            textMuted: "#5F6780",   // text-tertiary
            primary:   "#D93A10",   // light primary-500 (text-safe)
            dot:       "#FF4A18",   // brand orange dot (always)
        }
        : {
            bg:        "#131414",   // background dark
            surface:   "#212529",   // surface-1 dark
            surface2:  "#2C3036",   // surface-2 dark
            border:    "#3A3F47",
            text:      "#E8ECF8",   // foreground dark
            textMuted: "#8A93A6",   // text-tertiary dark
            primary:   "#FF4A18",   // dark primary-500
            dot:       "#FF4A18",
        };

    return (
        <div
            className="aspect-[16/10] w-full p-3 flex gap-2 select-none pointer-events-none border-b"
            style={{ background: c.bg, borderColor: c.border }}
        >
            {/* Sidebar */}
            <div
                className="w-[28%] rounded-md border flex flex-col gap-1.5 p-2"
                style={{ background: c.surface, borderColor: c.border }}
            >
                {/* Logo */}
                <div className="flex items-baseline gap-0.5 mb-1">
                    <span
                        className="text-[8px] font-black tracking-tighter"
                        style={{ color: c.text, lineHeight: 1 }}
                    >
                        kontave
                    </span>
                    <span
                        className="w-1 h-1 rounded-full"
                        style={{ background: c.dot }}
                    />
                </div>
                {/* Active row */}
                <div
                    className="h-1.5 rounded-sm w-full"
                    style={{ background: c.primary, opacity: 0.18 }}
                />
                {/* Inactive rows */}
                {[0.42, 0.55, 0.40, 0.50].map((w, i) => (
                    <div
                        key={i}
                        className="h-1.5 rounded-sm"
                        style={{ background: c.textMuted, opacity: 0.22, width: `${w * 100}%` }}
                    />
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col gap-1.5">
                {/* Page header */}
                <div
                    className="rounded-md border px-2 py-1.5 flex items-center justify-between"
                    style={{ background: c.surface, borderColor: c.border }}
                >
                    <div className="flex flex-col gap-0.5">
                        <div
                            className="h-1.5 rounded-sm"
                            style={{ background: c.text, opacity: 0.85, width: 28 }}
                        />
                        <div
                            className="h-1 rounded-sm"
                            style={{ background: c.textMuted, opacity: 0.5, width: 18 }}
                        />
                    </div>
                    <div
                        className="h-2.5 w-7 rounded-sm"
                        style={{ background: c.primary }}
                    />
                </div>

                {/* Body card */}
                <div
                    className="flex-1 rounded-md border p-2 flex flex-col gap-1.5"
                    style={{ background: c.surface, borderColor: c.border }}
                >
                    {/* table header */}
                    <div
                        className="h-1 rounded-sm w-full"
                        style={{ background: c.surface2 }}
                    />
                    {/* rows */}
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="flex items-center gap-1.5">
                            <div
                                className="h-1 rounded-sm flex-1"
                                style={{ background: c.textMuted, opacity: 0.35 }}
                            />
                            <div
                                className="h-1 rounded-sm w-4"
                                style={{ background: i === 1 ? c.primary : c.textMuted, opacity: i === 1 ? 0.9 : 0.35 }}
                            />
                            <div
                                className="h-1 rounded-sm w-6 tabular-nums"
                                style={{ background: c.text, opacity: 0.7 }}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
