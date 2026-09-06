import {
  Text as NativeText,
  type TextProps as NativeTextProps,
} from "react-native";
import { useUiTheme } from "./theme";

export type TextTone = "default" | "muted" | "subtle" | "inherit";
export type TextElement =
  "span" | "p" | "small" | "strong" | "h1" | "h2" | "h3";
export interface TextProps extends NativeTextProps {
  readonly tone?: TextTone;
  readonly as?: TextElement;
}
export interface HeadingProps extends TextProps {
  readonly level?: 1 | 2 | 3 | 4 | 5 | 6;
}

/**
 * Renders text with semantic tone and native text accessibility.
 * @param props - Content, tone, optional semantic emphasis and native text props.
 * @returns Text that follows the current UI theme.
 */
export function Text({ tone = "default", as, style, ...props }: TextProps) {
  const { colors } = useUiTheme();
  const color =
    tone === "inherit"
      ? undefined
      : tone === "muted"
        ? colors.muted
        : tone === "subtle"
          ? colors.subtle
          : colors.text;
  return (
    <NativeText
      {...props}
      style={[
        { fontSize: as === "small" ? 13 : 16, color },
        as === "strong" && { fontWeight: "700" },
        style,
      ]}
    />
  );
}

/**
 * Renders a heading with native screen-reader header semantics.
 * @param props - Heading level, content and optional native text styling.
 * @returns An accessible themed heading.
 */
export function Heading({ level = 1, style, ...props }: HeadingProps) {
  return (
    <Text
      {...props}
      accessibilityRole="header"
      style={[
        {
          fontSize: [30, 24, 20, 18, 16, 14][level - 1],
          fontWeight: "700",
        },
        style,
      ]}
    />
  );
}
