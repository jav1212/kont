import { themeVariables, type KontaveTheme } from "@kontave/ui/tokens";

/**
 * Applies the canonical semantic theme variables to a DOM root.
 *
 * @param root - DOM element that owns the active theme.
 * @param theme - Semantic theme to apply.
 * @returns Nothing after synchronously updating the element styles and metadata.
 */
export function applyDesignTokens(
  root: HTMLElement,
  theme: KontaveTheme = "light",
): void {
  const variables = themeVariables[theme];
  Object.entries(variables).forEach(([name, value]) =>
    root.style.setProperty(name, value),
  );
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}
