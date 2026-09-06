import { useState, type ReactNode } from "react";
import { Image, type ImageProps, type TextProps } from "react-native";
import { Text } from "./typography";
import { useUiTheme } from "./theme";

export interface ImageWithFallbackProps extends Omit<
  ImageProps,
  "source" | "alt" | "src"
> {
  readonly src?: string | null;
  readonly source?: ImageProps["source"];
  readonly alt?: string;
  readonly fallback: ReactNode;
}
export interface LogoProps extends Omit<TextProps, "children"> {
  readonly size?: number;
}

/**
 * Replaces failed media with supplied content and retries when its source changes.
 * @param props - Portable URL or native source, accessible description and fallback.
 * @returns Native media until that source fails; URL props take precedence over source.
 */
export function ImageWithFallback({
  src,
  source,
  alt,
  fallback,
  onError,
  ...props
}: ImageWithFallbackProps) {
  const resolved = src === undefined ? source : src ? { uri: src } : undefined;
  const key = JSON.stringify(resolved);
  const [failed, setFailed] = useState<string | undefined>();
  if (!resolved || failed === key)
    return typeof fallback === "string" || typeof fallback === "number" ? (
      <Text>{fallback}</Text>
    ) : (
      <>{fallback}</>
    );
  return (
    <Image
      {...props}
      key={key}
      source={resolved}
      alt={alt ?? props.accessibilityLabel ?? ""}
      accessibilityLabel={alt ?? props.accessibilityLabel}
      onError={(event) => {
        setFailed(key);
        onError?.(event);
      }}
    />
  );
}

/**
 * Displays the Kontave wordmark with native image accessibility semantics.
 * @param props - Wordmark size and optional native text props.
 * @returns The full brand wordmark using semantic colors.
 */
export function LogoFull({ size = 30, style, ...props }: LogoProps) {
  const { colors } = useUiTheme();
  return (
    <Text
      {...props}
      accessibilityRole="image"
      accessibilityLabel={props.accessibilityLabel ?? "Kontave"}
      style={[{ fontSize: size, fontWeight: "900" }, style]}
    >
      kontave
      <Text style={{ color: colors.brandAccent, fontSize: size }}>.</Text>
    </Text>
  );
}

/**
 * Displays the compact Kontave mark for constrained navigation surfaces.
 * @param props - Mark size and optional native text props.
 * @returns The compact brand mark using semantic colors.
 */
export function LogoMark({ size = 30, style, ...props }: LogoProps) {
  const { colors } = useUiTheme();
  return (
    <Text
      {...props}
      accessibilityRole="image"
      accessibilityLabel={props.accessibilityLabel ?? "Kontave"}
      style={[{ fontSize: size, fontWeight: "900" }, style]}
    >
      k<Text style={{ color: colors.brandAccent, fontSize: size }}>.</Text>
    </Text>
  );
}
