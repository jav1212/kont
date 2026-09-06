import type { KontaveTheme } from "@kontave/ui/tokens";
import { applyDesignTokens } from "@kontave/ui";

const desktopSansFont =
  '"Darker Grotesque", ui-sans-serif, system-ui, sans-serif';
const desktopMonoFont =
  '"Geist Mono", ui-monospace, "Cascadia Code", "Segoe UI Mono", monospace';

/**
 * Applies the selected theme tokens to the Desktop document root.
 * @param root - Root element that receives the design tokens.
 * @param theme - Valid Kontave theme selected by the user.
 * @returns Nothing.
 */
export function applyDesktopTheme(
  root: HTMLElement,
  theme: KontaveTheme,
): void {
  applyDesktopThemeTokens(root, theme);
  const providerRoot = root.querySelector<HTMLElement>("[data-kontave-theme]");
  if (providerRoot) applyDesktopThemeTokens(providerRoot, theme);
}

function applyDesktopThemeTokens(target: HTMLElement, theme: KontaveTheme): void {
  applyDesignTokens(target, theme);
  target.style.setProperty("--kt-font-body", desktopSansFont);
  target.style.setProperty("--kt-font-display", desktopSansFont);
  target.style.setProperty("--kt-font-action", desktopSansFont);
  target.style.setProperty("--kt-font-mono", desktopMonoFont);
}
