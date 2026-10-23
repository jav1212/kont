import { BaseBadge } from "@/src/shared/frontend/components/base-badge";

/** Fiscal lifecycle status values shown by the IVA workspace. */
export type IvaPeriodStatus = "open" | "in_review" | "prepared" | "declared" | "paid" | "closed" | "unconfigured";
const STATUS: Record<IvaPeriodStatus, { readonly label: string; readonly variant: "warning" | "success" | "neutral" | "info" }> = {
  open: { label: "Abierto", variant: "neutral" }, in_review: { label: "En revisión", variant: "warning" },
  prepared: { label: "Preparado", variant: "info" }, declared: { label: "Declarado", variant: "success" },
  paid: { label: "Pagado", variant: "success" }, closed: { label: "Cerrado", variant: "neutral" },
  unconfigured: { label: "Periodicidad no configurada", variant: "warning" },
};

/** Renders a localized VAT fiscal-period status.
 * @param props - Persisted status or the missing-periodicity state.
 * @returns A semantic status badge.
 */
export function PeriodStatusBadge({ status }: { readonly status: IvaPeriodStatus }): React.JSX.Element {
  const value = STATUS[status];
  return <BaseBadge variant={value.variant} dot>{value.label}</BaseBadge>;
}
