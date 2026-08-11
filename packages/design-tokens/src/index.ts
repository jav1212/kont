export type KontaveTheme = "light" | "dark";

export const designTokens = {
  color: {
    brand: { 50: "#FFF4F0", 100: "#FFE5DB", 200: "#FFC9B5", 500: "#D93A10", 600: "#B22C0B", accent: "#FF4A18" },
    neutral: { 50: "#F8F9FC", 100: "#EEF0F7", 200: "#DDE1EE", 400: "#A0A9C2", 600: "#464D66", 700: "#333A52", 900: "#111525", 950: "#090B12" },
    status: { success: "#047857", warning: "#92400E", danger: "#B91C1C", info: "#2563EB" },
  },
  space: { 1: "0.25rem", 2: "0.5rem", 3: "0.75rem", 4: "1rem", 5: "1.25rem", 6: "1.5rem", 8: "2rem", 10: "2.5rem" },
  radius: { sm: "0.5rem", md: "0.75rem", lg: "1rem", full: "9999px" },
  shadow: { sm: "0 1px 3px rgb(8 9 16 / 0.08)", md: "0 8px 24px rgb(8 9 16 / 0.10)" },
  motion: { fast: "100ms", base: "150ms", slow: "300ms", easing: "cubic-bezier(0.25, 1, 0.5, 1)" },
  control: { heightSm: "2.25rem", heightMd: "2.5rem", heightLg: "3rem" },
} as const;

const baseVariables: Readonly<Record<string, string>> = {
  "--kt-space-1": designTokens.space[1], "--kt-space-2": designTokens.space[2], "--kt-space-3": designTokens.space[3],
  "--kt-space-4": designTokens.space[4], "--kt-space-5": designTokens.space[5], "--kt-space-6": designTokens.space[6],
  "--kt-space-8": designTokens.space[8], "--kt-space-10": designTokens.space[10],
  "--kt-radius-sm": designTokens.radius.sm, "--kt-radius-md": designTokens.radius.md, "--kt-radius-lg": designTokens.radius.lg,
  "--kt-radius-full": designTokens.radius.full,
  "--kt-shadow-sm": designTokens.shadow.sm, "--kt-shadow-md": designTokens.shadow.md,
  "--kt-motion-fast": designTokens.motion.fast, "--kt-motion-base": designTokens.motion.base, "--kt-easing": designTokens.motion.easing,
  "--kt-control-sm": designTokens.control.heightSm, "--kt-control-md": designTokens.control.heightMd, "--kt-control-lg": designTokens.control.heightLg,
};

export const themeVariables: Readonly<Record<KontaveTheme, Readonly<Record<string, string>>>> = {
  light: {
    ...baseVariables,
    "--kt-background": "#F6F8FF", "--kt-surface": "#FFFFFF", "--kt-surface-muted": "#F8F9FC",
    "--kt-text": "#111525", "--kt-text-muted": "#464D66", "--kt-text-subtle": "#5F6780",
    "--kt-border": "#AEB6C8", "--kt-border-subtle": "#D9DDE8", "--kt-primary": "#D93A10",
    "--kt-primary-hover": "#B22C0B", "--kt-primary-soft": "#FFF4F0", "--kt-focus": "#D93A10",
    "--kt-success": "#047857", "--kt-warning": "#92400E", "--kt-danger": "#B91C1C", "--kt-info": "#2563EB",
  },
  dark: {
    ...baseVariables,
    "--kt-background": "#131414", "--kt-surface": "#212529", "--kt-surface-muted": "#2C3036",
    "--kt-text": "#E8ECF8", "--kt-text-muted": "#A8AEBF", "--kt-text-subtle": "#8A93A6",
    "--kt-border": "#66718C", "--kt-border-subtle": "#3D424A", "--kt-primary": "#FF4A18",
    "--kt-primary-hover": "#FF7450", "--kt-primary-soft": "#3D0F03", "--kt-focus": "#FF7450",
    "--kt-success": "#34D399", "--kt-warning": "#FBBF24", "--kt-danger": "#F87171", "--kt-info": "#60A5FA",
  },
};

/** Applies platform-neutral tokens to a DOM root without duplicating CSS values. */
export function applyDesignTokens(root: HTMLElement, theme: KontaveTheme = "light"): void {
  const variables = themeVariables[theme];
  Object.entries(variables).forEach(([name, value]) => root.style.setProperty(name, value));
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}
