import type { HTMLAttributes } from "react";
import { classNames } from "./internal/class-names.js";

export interface LogoProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  readonly size?: number;
}

/** Full Kontave wordmark, equivalent to the production HTML logo. */
export function LogoFull({ className, size = 30, style, ...props }: LogoProps) {
  return <span {...props} role="img" aria-label="Kontave"
    className={classNames("kt-logo", className)} style={{ fontSize: size, lineHeight: 1, ...style }}>
    <span>kontave</span><span className="kt-logo__dot">.</span>
  </span>;
}

/** Compact HTML monogram for collapsed navigation and constrained surfaces. */
export function LogoMark({ className, size = 30, style, ...props }: LogoProps) {
  return <span {...props} role="img" aria-label="Kontave"
    className={classNames("kt-logo", className)} style={{ fontSize: size, lineHeight: 1, ...style }}>
    <span>k</span><span className="kt-logo__dot">.</span>
  </span>;
}
