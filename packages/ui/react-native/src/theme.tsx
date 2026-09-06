import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  getUiColors,
  nativeMetrics,
  type KontaveTheme,
  type UiColors,
} from "@kontave/ui/tokens";

/** Default light theme for static application styles; components use context. */
export const reactNativeTheme = {
  color: getUiColors("light"),
  ...nativeMetrics,
} as const;

/** Explicit presentation configuration shared by the renderers. */
export interface UiThemeContextValue {
  readonly theme: KontaveTheme;
  readonly locale: string;
  readonly colors: UiColors;
}

/** UI configuration; preferences and persistence belong to the consumer. */
export interface UiProviderProps {
  readonly children: ReactNode;
  readonly theme?: KontaveTheme;
  readonly locale?: string;
}

const ThemeContext = createContext<UiThemeContextValue>({
  theme: "light",
  locale: "es-VE",
  colors: getUiColors("light"),
});

/**
 * Supplies reactive colors and locale without owning application preferences.
 * @param props - Explicit presentation configuration and subtree.
 * @returns The configured native subtree, including native modal descendants.
 */
export function UiProvider({
  children,
  theme = "light",
  locale = "es-VE",
}: UiProviderProps) {
  const value = useMemo(
    () => ({ theme, locale, colors: getUiColors(theme) }),
    [theme, locale],
  );
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/**
 * Reads the nearest provider, or the documented light/es-VE defaults.
 * @returns Reactive semantic colors and presentation configuration.
 */
export function useUiTheme(): UiThemeContextValue {
  return useContext(ThemeContext);
}
