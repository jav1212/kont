import {
  createContext,
  useContext,
  type CSSProperties,
  type ReactNode,
} from "react";
import { I18nProvider } from "react-aria-components";
import {
  getUiColors,
  themeVariables,
  type UiColors,
  type KontaveTheme,
} from "@kontave/ui/tokens";

/** Theme state made available to DOM UI descendants. */
export interface UiThemeContextValue {
  /** The semantic theme selected by the client. */
  readonly theme: KontaveTheme;
  readonly locale: string;
  readonly colors: UiColors;
}

/** Properties accepted by the DOM UI provider. */
export interface UiProviderProps {
  /** Content that consumes the shared semantic theme. */
  readonly children: ReactNode;
  /** Semantic theme to apply to the provider root. */
  readonly theme?: KontaveTheme;
  /** Locale supplied by the client for localized child components. */
  readonly locale?: string;
}

const ThemeContext = createContext<UiThemeContextValue>({
  theme: "light",
  locale: "es-VE",
  colors: getUiColors("light"),
});

/**
 * Provides semantic UI theme tokens to a DOM subtree.
 *
 * @param props - Content and the theme to apply.
 * @returns A provider root with CSS variables for the requested theme.
 */
export function UiProvider({
  children,
  locale = "es-VE",
  theme = "light",
}: UiProviderProps): React.JSX.Element {
  return (
    <I18nProvider locale={locale}>
      <ThemeContext.Provider
        value={{ theme, locale, colors: getUiColors(theme) }}
      >
        <div
          data-kontave-theme={theme}
          data-theme={theme}
          style={
            {
              ...themeVariables[theme],
              color: "var(--kt-text)",
              backgroundColor: "var(--kt-background)",
              colorScheme: theme,
            } as CSSProperties
          }
        >
          {children}
        </div>
      </ThemeContext.Provider>
    </I18nProvider>
  );
}

/**
 * Reads the semantic theme from the nearest UI provider.
 *
 * @returns The selected UI theme.
 */
export function useUiTheme(): UiThemeContextValue {
  return useContext(ThemeContext);
}
