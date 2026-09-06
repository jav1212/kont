import type { ComponentPropsWithoutRef } from "react";

function classNames(...values: ReadonlyArray<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export interface SubscriptionPlanBadgeProps extends Omit<ComponentPropsWithoutRef<"span">, "children"> {
  readonly planName: string;
}

/**
 * Renders the selected account plan in Desktop account menus.
 * @param props - Account plan name and standard span properties.
 * @returns A compact plan badge.
 */
export function SubscriptionPlanBadge({ className, planName, ...props }: SubscriptionPlanBadgeProps) {
  return <span {...props} className={classNames("kt-subscription-plan-badge", className)}>
    {sentenceCase(planName)}
  </span>;
}

function sentenceCase(value: string): string {
  const normalized = value.trim().replaceAll("_", " ").replace(/\s+/g, " ").toLocaleLowerCase("es");
  return normalized ? normalized.charAt(0).toLocaleUpperCase("es") + normalized.slice(1) : value;
}
