/** Supported semantic color themes. */
export type KontaveTheme = "light" | "dark";

/** Canonical renderer-neutral design values. */
export const designTokens = {
  color: {
    brand: {
      50: "#FFF4F0",
      100: "#FFE5DB",
      200: "#FFC9B5",
      400: "#FF7450",
      500: "#D93A10",
      600: "#B22C0B",
      800: "#661805",
      900: "#3D0F03",
      accent: "#FF4A18",
    },
    neutral: {
      50: "#F8F9FC",
      100: "#EEF0F7",
      200: "#DDE1EE",
      400: "#A0A9C2",
      600: "#464D66",
      700: "#333A52",
      900: "#111525",
      950: "#090B12",
    },
    status: {
      success: "#047857",
      warning: "#92400E",
      danger: "#B91C1C",
      info: "#2563EB",
    },
  },
  space: {
    1: "0.25rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.25rem",
    6: "1.5rem",
    8: "2rem",
    10: "2.5rem",
  },
  radius: { sm: "0.5rem", md: "0.75rem", lg: "1rem", full: "9999px" },
  shadow: {
    sm: "0 1px 3px rgb(8 9 16 / 0.08)",
    md: "0 8px 24px rgb(8 9 16 / 0.10)",
  },
  motion: {
    fast: "100ms",
    base: "150ms",
    slow: "300ms",
    easing: "cubic-bezier(0.25, 1, 0.5, 1)",
  },
  control: { heightSm: "2.25rem", heightMd: "2.5rem", heightLg: "3rem" },
  typography: {
    body: '"Dosis", ui-sans-serif, system-ui, sans-serif',
    display:
      '"Darker Grotesque", "Dosis", ui-sans-serif, system-ui, sans-serif',
    mono: 'ui-monospace, "Cascadia Code", "Segoe UI Mono", monospace',
  },
} as const;

const baseVariables: Readonly<Record<string, string>> = {
  "--kt-space-1": designTokens.space[1],
  "--kt-space-2": designTokens.space[2],
  "--kt-space-3": designTokens.space[3],
  "--kt-space-4": designTokens.space[4],
  "--kt-space-5": designTokens.space[5],
  "--kt-space-6": designTokens.space[6],
  "--kt-space-8": designTokens.space[8],
  "--kt-space-10": designTokens.space[10],
  "--kt-radius-sm": designTokens.radius.sm,
  "--kt-radius-md": designTokens.radius.md,
  "--kt-radius-lg": designTokens.radius.lg,
  "--kt-radius-full": designTokens.radius.full,
  "--kt-shadow-sm": designTokens.shadow.sm,
  "--kt-shadow-md": designTokens.shadow.md,
  "--kt-motion-fast": designTokens.motion.fast,
  "--kt-motion-base": designTokens.motion.base,
  "--kt-easing": designTokens.motion.easing,
  "--kt-control-sm": designTokens.control.heightSm,
  "--kt-control-md": designTokens.control.heightMd,
  "--kt-control-lg": designTokens.control.heightLg,
  "--kt-font-body": designTokens.typography.body,
  "--kt-font-display": designTokens.typography.display,
  "--kt-font-action": designTokens.typography.display,
  "--kt-font-mono": designTokens.typography.mono,
  "--kt-brand-bright": designTokens.color.brand[400],
  "--kt-brand-accent": designTokens.color.brand.accent,
  "--kt-brand-deep": designTokens.color.brand[800],
  "--kt-brand-ink": designTokens.color.brand[900],
};

/** Canonical semantic CSS-variable values for each supported theme. */
export const themeVariables: Readonly<
  Record<KontaveTheme, Readonly<Record<string, string>>>
> = {
  light: {
    ...baseVariables,
    "--kt-on-primary": "#FFFFFF",
    "--kt-background": "#F6F8FF",
    "--kt-surface": "#FFFFFF",
    "--kt-surface-muted": "#F8F9FC",
    "--kt-text": "#111525",
    "--kt-text-muted": "#464D66",
    "--kt-text-subtle": "#5F6780",
    "--kt-border": "#AEB6C8",
    "--kt-border-subtle": "#D9DDE8",
    "--kt-primary": "#D93A10",
    "--kt-primary-hover": "#B22C0B",
    "--kt-primary-soft": "#FFF4F0",
    "--kt-focus": "#D93A10",
    "--kt-success": "#047857",
    "--kt-warning": "#92400E",
    "--kt-danger": "#B91C1C",
    "--kt-info": "#2563EB",
    "--kt-sidebar-background": "#FFFFFF",
    "--kt-sidebar-border": "#D9DDE8",
    "--kt-sidebar-label": "#5F6780",
    "--kt-sidebar-text": "#464D66",
    "--kt-sidebar-text-strong": "#111525",
    "--kt-sidebar-hover": "#EEF0F7",
    "--kt-sidebar-active-background": "#FFE5DB",
    "--kt-sidebar-active-text": "#B22C0B",
    "--kt-sidebar-active-border": "#FFC9B5",
  },
  dark: {
    ...baseVariables,
    "--kt-on-primary": "#090B12",
    "--kt-background": "#131414",
    "--kt-surface": "#212529",
    "--kt-surface-muted": "#2C3036",
    "--kt-text": "#E8ECF8",
    "--kt-text-muted": "#A8AEBF",
    "--kt-text-subtle": "#8A93A6",
    "--kt-border": "#66718C",
    "--kt-border-subtle": "#3D424A",
    "--kt-primary": "#FF4A18",
    "--kt-primary-hover": "#FF7450",
    "--kt-primary-soft": "#3D0F03",
    "--kt-focus": "#FF7450",
    "--kt-success": "#34D399",
    "--kt-warning": "#FBBF24",
    "--kt-danger": "#F87171",
    "--kt-info": "#60A5FA",
    "--kt-sidebar-background": "#111315",
    "--kt-sidebar-border": "rgb(255 255 255 / 0.06)",
    "--kt-sidebar-label": "rgb(232 236 248 / 0.62)",
    "--kt-sidebar-text": "rgb(232 236 248 / 0.72)",
    "--kt-sidebar-text-strong": "rgb(232 236 248 / 0.92)",
    "--kt-sidebar-hover": "rgb(255 255 255 / 0.06)",
    "--kt-sidebar-active-background": "rgb(255 74 24 / 0.16)",
    "--kt-sidebar-active-text": "#FF4A18",
    "--kt-sidebar-active-border": "rgb(255 74 24 / 0.36)",
  },
};

/**
 * Resolves renderer-independent semantic colors from the canonical theme.
 * @param theme - Explicit theme selected by the consuming presentation.
 * @returns Shared color roles; neither renderer owns a parallel palette.
 * @throws Error if a required canonical token is missing.
 */
export function getUiColors(theme: KontaveTheme) {
  const value = (name: string): string => {
    const token = themeVariables[theme][`--kt-${name}`];
    if (token === undefined) throw new Error(`Missing UI token: ${name}`);
    return token;
  };
  return {
    background: value("background"),
    surface: value("surface"),
    surfaceMuted: value("surface-muted"),
    text: value("text"),
    muted: value("text-muted"),
    subtle: value("text-subtle"),
    border: value("border"),
    primary: value("primary"),
    primarySoft: value("primary-soft"),
    focus: value("focus"),
    success: value("success"),
    warning: value("warning"),
    danger: value("danger"),
    info: value("info"),
    brandBright: value("brand-bright"),
    brandAccent: value("brand-accent"),
    brandDeep: value("brand-deep"),
    brandInk: value("brand-ink"),
    onPrimary: value("on-primary"),
  } as const;
}

/** Semantic palette shared by both renderers. */
export type UiColors = ReturnType<typeof getUiColors>;

/** Native numeric metrics derived from the same canonical CSS scale. */
export const nativeMetrics = {
  space: {
    xs: parseFloat(designTokens.space[1]) * 16,
    sm: parseFloat(designTokens.space[2]) * 16,
    md: parseFloat(designTokens.space[3]) * 16,
    lg: parseFloat(designTokens.space[4]) * 16,
    xl: parseFloat(designTokens.space[6]) * 16,
    xxl: parseFloat(designTokens.space[8]) * 16,
  },
  radius: {
    sm: parseFloat(designTokens.radius.sm) * 16,
    md: parseFloat(designTokens.radius.md) * 16,
    lg: parseFloat(designTokens.radius.lg) * 16,
    full: parseFloat(designTokens.radius.full),
  },
  // Native controls reserve at least 44 points for touch interaction.
  control: {
    sm: parseFloat(designTokens.control.heightSm) * 16,
    md: Math.max(44, parseFloat(designTokens.control.heightMd) * 16),
    lg: parseFloat(designTokens.control.heightLg) * 16,
  },
  motion: { pulse: 700 },
} as const;
