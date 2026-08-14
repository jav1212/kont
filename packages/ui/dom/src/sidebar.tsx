import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { classNames } from "./internal/class-names.js";

export type SidebarPresentation = "expanded" | "collapsed" | "overlay";

export interface SidebarProps extends ComponentPropsWithoutRef<"aside"> {
  readonly presentation?: SidebarPresentation;
}

export function Sidebar({ className, presentation = "expanded", ...props }: SidebarProps) {
  return <aside
    {...props}
    data-presentation={presentation}
    className={classNames("kt-sidebar", className)}
  />;
}

export function SidebarHeader({ className, ...props }: ComponentPropsWithoutRef<"header">) {
  return <header {...props} className={classNames("kt-sidebar__header", className)} />;
}

export function SidebarNav({ className, ...props }: ComponentPropsWithoutRef<"nav">) {
  return <nav {...props} className={classNames("kt-sidebar__nav", className)} />;
}

interface SidebarSectionProps extends ComponentPropsWithoutRef<"section"> {
  readonly label?: string;
}

export function SidebarSection({ children, className, label, ...props }: SidebarSectionProps) {
  return <section {...props} className={classNames("kt-sidebar__section", className)}>
    {label ? <h2 className="kt-sidebar__section-label">{label}</h2> : null}
    <div className="kt-sidebar__section-items">{children}</div>
  </section>;
}

interface SidebarItemContentProps {
  readonly active?: boolean;
  readonly badge?: ReactNode;
  readonly icon: ReactNode;
  readonly label: string;
}

function SidebarItemContent({ badge, icon, label }: SidebarItemContentProps) {
  return <>
    <span className="kt-sidebar__item-icon" aria-hidden="true">{icon}</span>
    <span className="kt-sidebar__item-label">{label}</span>
    {badge ? <span className="kt-sidebar__item-badge">{badge}</span> : null}
  </>;
}

export interface SidebarActionProps extends Omit<ComponentPropsWithoutRef<"button">, "children">, SidebarItemContentProps {}

export function SidebarAction({ active = false, badge, className, icon, label, type = "button", ...props }: SidebarActionProps) {
  return <button
    {...props}
    type={type}
    title={label}
    aria-current={active ? "page" : undefined}
    className={classNames("kt-sidebar__item", active && "kt-sidebar__item--active", className)}
  >
    <SidebarItemContent active={active} badge={badge} icon={icon} label={label} />
  </button>;
}

export interface SidebarLinkProps extends Omit<ComponentPropsWithoutRef<"a">, "children">, SidebarItemContentProps {}

export function SidebarLink({ active = false, badge, className, icon, label, ...props }: SidebarLinkProps) {
  return <a
    {...props}
    title={label}
    aria-current={active ? "page" : undefined}
    className={classNames("kt-sidebar__item", active && "kt-sidebar__item--active", className)}
  >
    <SidebarItemContent active={active} badge={badge} icon={icon} label={label} />
  </a>;
}

export function SidebarFooter({ className, ...props }: ComponentPropsWithoutRef<"footer">) {
  return <footer {...props} className={classNames("kt-sidebar__footer", className)} />;
}
