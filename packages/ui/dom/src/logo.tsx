import type { HTMLAttributes } from "react";
import { classNames } from "./internal/class-names";

export interface LogoProps extends Omit<
  HTMLAttributes<HTMLSpanElement>,
  "children"
> {
  readonly size?: number;
}

/**
 * Displays the full Kontave wordmark as an accessible brand image.
 * @param props - Wordmark size and optional DOM attributes.
 * @returns The themed full brand wordmark.
 */
export function LogoFull({ className, size = 30, style, ...props }: LogoProps) {
  return (
    <span
      {...props}
      role="img"
      aria-label="Kontave"
      className={classNames("kt-logo", className)}
      style={{ fontSize: size, lineHeight: 1, ...style }}
    >
      <span>kontave</span>
      <span className="kt-logo__dot">.</span>
    </span>
  );
}

/**
 * Displays the compact Kontave mark on constrained surfaces.
 * @param props - Mark size and optional DOM attributes.
 * @returns The themed compact mark with an accessible name.
 */
export function LogoMark({ className, size = 30, style, ...props }: LogoProps) {
  return (
    <span
      {...props}
      role="img"
      aria-label="Kontave"
      className={classNames("kt-logo", className)}
      style={{ fontSize: size, lineHeight: 1, ...style }}
    >
      <span>k</span>
      <span className="kt-logo__dot">.</span>
    </span>
  );
}
