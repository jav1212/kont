import type { ComponentPropsWithoutRef } from "react";
import { classNames } from "./internal/class-names";

/**
 * Groups content in a themed bordered surface.
 * @param props - Section attributes and composed card content.
 * @returns A semantic card surface.
 */
export function Card({
  className,
  ...props
}: ComponentPropsWithoutRef<"section">) {
  return <section {...props} className={classNames("kt-card", className)} />;
}
