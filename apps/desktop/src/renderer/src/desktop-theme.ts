import { applyDesignTokens, type KontaveTheme } from "@kontave/design-tokens";

const desktopSansFont = '"Darker Grotesque", ui-sans-serif, system-ui, sans-serif';
const desktopMonoFont = '"Geist Mono", ui-monospace, "Cascadia Code", "Segoe UI Mono", monospace';

export function applyDesktopTheme(root: HTMLElement, theme: KontaveTheme): void {
  applyDesignTokens(root, theme);
  root.style.setProperty("--kt-font-body", desktopSansFont);
  root.style.setProperty("--kt-font-display", desktopSansFont);
  root.style.setProperty("--kt-font-action", desktopSansFont);
  root.style.setProperty("--kt-font-mono", desktopMonoFont);
}
