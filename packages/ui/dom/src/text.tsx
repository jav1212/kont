import { createElement, type HTMLAttributes } from "react";
import { classNames } from "./internal/class-names.js";

export type TextElement = "span" | "p" | "small" | "strong";
export type TextTone = "default" | "muted" | "subtle" | "inherit";

export interface TextProps extends HTMLAttributes<HTMLElement> {
  readonly as?: TextElement;
  readonly tone?: TextTone;
}

/** Shared inline/body typography primitive. The caller chooses the semantic HTML element. */
export function Text({ as = "span", className, tone = "default", ...props }: TextProps) {
  return createElement(as, {
    ...props,
    className: classNames("kt-text", `kt-text--${tone}`, className),
  });
}
