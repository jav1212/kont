import { createElement, type HTMLAttributes } from "react";
import { classNames } from "./internal/class-names";

export type TextElement =
  "span" | "p" | "small" | "strong" | "h1" | "h2" | "h3";
export type TextTone = "default" | "muted" | "subtle" | "inherit";

export interface TextProps extends HTMLAttributes<HTMLElement> {
  readonly as?: TextElement;
  readonly tone?: TextTone;
}

/**
 * Applies semantic typography while preserving the chosen HTML element.
 * @param props - Content, element semantics, color tone and DOM attributes.
 * @returns Text with the theme typography and requested semantic role.
 */
export function Text({
  as = "span",
  className,
  tone = "default",
  ...props
}: TextProps) {
  return createElement(as, {
    ...props,
    className: classNames("kt-text", `kt-text--${tone}`, className),
  });
}
