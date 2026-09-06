import type { ComponentPropsWithoutRef } from "react";
import { classNames } from "./internal/class-names";

/** Properties accepted by the semantic DOM heading primitive. */
export interface HeadingProps extends ComponentPropsWithoutRef<"h2"> {
  /** Heading level rendered for assistive technology and document structure. */
  readonly level?: 1 | 2 | 3 | 4 | 5 | 6;
}

/**
 * Renders a semantic heading using the Kontave display typography.
 *
 * @param props - Heading content, level, and standard HTML attributes.
 * @returns A semantic DOM heading.
 */
export function Heading({
  className,
  level = 1,
  ...props
}: HeadingProps): React.JSX.Element {
  const Element = `h${level}` as const;
  return <Element {...props} className={classNames("kt-heading", className)} />;
}
