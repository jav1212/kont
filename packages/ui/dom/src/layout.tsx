import type { ComponentPropsWithoutRef } from "react";
import { classNames } from "./internal/class-names";

/**
 * Provides a semantic page surface without imposing navigation or application state.
 * @param props - Main-element attributes and composed page content.
 * @returns A themed page container.
 */
export function PageShell({
  className,
  ...props
}: ComponentPropsWithoutRef<"main">) {
  return <main {...props} className={classNames("kt-page", className)} />;
}

/**
 * Arranges composed content vertically with the shared spacing scale.
 * @param props - Container attributes and stacked content.
 * @returns A vertical layout container.
 */
export function Stack({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return <div {...props} className={classNames("kt-stack", className)} />;
}

/**
 * Provides the common screen surface for DOM consumers.
 * @param props - Screen attributes and composed content.
 * @returns A semantic full-height page surface.
 */
export function Screen(props: ComponentPropsWithoutRef<"main">) {
  return <PageShell {...props} />;
}
