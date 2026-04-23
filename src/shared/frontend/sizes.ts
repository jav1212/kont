/**
 * APP_SIZES — Centralized typography and spacing scale for KONT
 *
 * Design rationale — target demographic: finance professionals 40–60 years old.
 * The scale is intentionally +1 to +2 px above typical SaaS defaults:
 *
 *   - Table headers / form labels: 12 px  (was 11 px — too small for sustained reading)
 *   - Table body / input text:     15 px  (was 14 px — legibility at arm's-length distance)
 *   - Navigation items:            13 px  (was 12 px — sidebar items deserve readable weight)
 *   - Navigation group labels:     11 px  (was 10 px — still compact but not strained)
 *   - Helper / error text:         12 px  (keeps parity with labels for consistent rhythm)
 *   - Badge / chip content:        11 px  (compact badge that still reads at a glance)
 *   - Pagination:                  12 px  (numerical, tabular — 12 px is sufficient here)
 *
 * Button sizes match a standard 3-step scale that keeps touch targets generous:
 *   sm → h-8  (32 px),  md → h-9  (36 px),  lg → h-10 (40 px)
 *
 * TYPOGRAPHY POLICY (mono vs sans)
 * ─────────────────────────────────
 * The app's visual identity is monospace-first (Geist Mono on body). Keep that for:
 *   - Tables (numbers, IDs, dates)
 *   - Inputs (values, placeholders over numeric fields)
 *   - Labels and chrome-like uppercase text
 *   - Badges, pagination, button text (tracking + uppercase = mono aesthetic)
 * Use Darker Grotesque (`font-sans`) for PROSE that benefits from proportional spacing:
 *   - Helper / error messages ("La cédula debe tener 10 dígitos")
 *   - Empty-state descriptions
 *   - Long-form placeholders in free-text fields
 *   - Tooltips with explanatory copy
 *   - Marketing / onboarding body text
 * Tokens below that embed `font-sans` or `font-mono` encode this policy.
 *
 * HOW TO USE
 * ──────────
 * Import and interpolate into your className strings:
 *
 *   import { APP_SIZES } from "@/src/shared/frontend/sizes";
 *
 *   const S = {
 *     th: `bg-surface-2 font-mono ${APP_SIZES.text.tableHeader} uppercase text-neutral-500`,
 *   };
 *
 * TO CHANGE THE BASE SCALE
 * ────────────────────────
 * Edit the px values in this file. All shared components derive their
 * font sizes from these constants — one edit propagates everywhere.
 */

export const APP_SIZES = {

    // ─────────────────────────────────────────────────────────────────────────
    // TEXT — semantic font-size tokens, including tracking where it matters
    // ─────────────────────────────────────────────────────────────────────────

    text: {
        /** Table <th> header cells — uppercase mono, compact tracking */
        tableHeader: "text-[12px] tracking-[0.14em]",

        /** Table <td> body cells — primary data reading size */
        tableBody: "text-[15px]",

        /** Table title label in the toolbar (e.g. "EMPLEADOS") */
        tableTitle: "text-[12px] tracking-[0.14em]",

        /** Form field labels (<label>) — uppercase mono */
        label: "text-[12px] tracking-[0.12em]",

        /** Input and select value text */
        input: "text-[15px]",

        /** Placeholder text inside inputs — mirrors input size */
        placeholder: "text-[15px]",

        /** Helper text and inline validation error messages (prose → sans) */
        helper: "text-[12px] font-sans",

        /** Badge / chip content (status indicators, filter chips) */
        badge: "text-[11px] tracking-wide",

        /** Overflow badge ("+3 more" style chip) */
        badgeOverflow: "text-[11px]",

        /** Select dropdown item — primary row label */
        selectItem: "text-[13px]",

        /** Select dropdown item — subtitle / secondary line */
        selectSubtitle: "text-[11px]",

        /** Select avatar initials */
        selectAvatar: "text-[10px]",

        /** Pagination record count ("25 de 200 registros") */
        paginationCount: "text-[12px]",

        /** Pagination "Filas" label */
        paginationRowsLabel: "text-[11px] uppercase tracking-[0.14em]",

        /** Pagination page buttons */
        paginationButton: "text-[12px]",

        /** Empty-state message in tables */
        emptyState: "text-[12px] uppercase tracking-[0.12em]",

        /** Result badge ("42 / 200") inside search toolbar */
        resultBadge: "text-[11px] tracking-wide",

        /** Date cell renderer */
        dateCell: "text-[13px]",
    },

    // ─────────────────────────────────────────────────────────────────────────
    // BUTTON — full size bundle per step (height + padding + text + gap)
    // ─────────────────────────────────────────────────────────────────────────

    button: {
        /** Small: h-8 (32 px touch target) */
        sm: "h-8 px-3 text-[12px] gap-1.5",

        /** Medium: h-9 (36 px) — default */
        md: "h-9 px-4 text-[13px] gap-2",

        /** Large: h-10 (40 px) — primary CTAs */
        lg: "h-10 px-5 text-[14px] gap-2",

        /**
         * Compact secondary toolbar button — used in spreadsheet-style page headers
         * (companies, payroll employees). Intentionally surface-1 bg (lighter than
         * BaseButton secondary's surface-2) and tighter tracking for dense layouts.
         * Use as a raw className when the element must be a <label> (file input trigger).
         */
        toolbarBtn: [
            "h-8 px-3 rounded-lg flex items-center gap-1.5 border border-border-light bg-surface-1",
            "hover:border-border-medium hover:bg-surface-2",
            "disabled:opacity-40 disabled:cursor-not-allowed",
            "font-mono text-[12px] uppercase tracking-[0.18em] text-foreground",
            "transition-colors duration-150",
        ].join(" "),
    },

    /** Icon-only button dimensions per size */
    iconButton: {
        sm: "w-7 h-7",
        md: "w-8 h-8",
        lg: "w-9 h-9",
    },

    // ─────────────────────────────────────────────────────────────────────────
    // NAV — sidebar navigation typography
    // ─────────────────────────────────────────────────────────────────────────

    nav: {
        /** Top-level module items and action buttons (Sign out, Theme) */
        item: "text-[13px] uppercase tracking-[0.12em]",

        /** Sub-navigation child items (routes within a module) */
        subItem: "text-[12px] uppercase tracking-[0.10em]",

        /** Section group headers ("Catálogos", "Operaciones", "Reportes") */
        group: "text-[11px] uppercase tracking-[0.16em]",

        /** Top-level section labels ("Módulos", "Empresa") */
        sectionLabel: "text-[10px] uppercase tracking-[0.18em]",

        /** Logo wordmark */
        logoWordmark: "text-[13px] uppercase tracking-[0.18em]",

        /** Logo subtitle ("Nómina") */
        logoSubtitle: "text-[10px] uppercase tracking-[0.16em]",

        /** Company name in the selector */
        companyName: "text-[12px]",

        /** Company avatar initials */
        companyAvatar: "text-[10px]",
    },

    // ─────────────────────────────────────────────────────────────────────────
    // SPACING — commonly used padding / gap bundles
    // ─────────────────────────────────────────────────────────────────────────

    spacing: {
        /** Standard table cell padding */
        tableCell: "px-4 py-3",

        /** Table header cell padding */
        tableHeader: "h-10 px-4 py-0",

        /** Toolbar padding + gap */
        toolbar: "px-4 py-3",

        /** Pagination footer padding */
        footer: "px-4 py-2.5",

        /** Form label bottom margin */
        labelBottom: "mb-1.5",

        /** Helper text / error top margin */
        helperTop: "mt-1.5",
    },

} as const;

/** Convenience type for consuming the sizes in typed contexts */
export type AppSizes = typeof APP_SIZES;
