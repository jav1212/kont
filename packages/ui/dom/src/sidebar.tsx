import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";
import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import { themeVariables } from "@kontave/ui/tokens";
import { Button, type ButtonProps } from "./button";
import { Text } from "./text";
import { useUiTheme } from "./theme";
import { classNames } from "./internal/class-names";

export type SidebarPresentation = "expanded" | "collapsed" | "overlay";
export interface SidebarProps extends ComponentPropsWithoutRef<"aside"> {
  readonly presentation?: SidebarPresentation;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly ariaLabel?: string;
}

/**
 * Composes navigation in an expanded rail, compact rail or controlled overlay.
 * @param props - Navigation content, presentation and optional overlay state.
 * @returns Generic navigation with modal focus containment when overlay is active.
 */
export function Sidebar({
  className,
  presentation = "expanded",
  open = false,
  onOpenChange,
  ariaLabel = "Navegación",
  ...props
}: SidebarProps) {
  const { theme } = useUiTheme();
  const content = (
    <aside
      {...props}
      aria-label={ariaLabel}
      data-presentation={presentation}
      className={classNames("kt-sidebar", className)}
    />
  );
  return presentation === "overlay" ? (
    <ModalOverlay
      isOpen={open}
      onOpenChange={(next) => onOpenChange?.(next)}
      isDismissable
      className="kt-sidebar-overlay"
      style={themeVariables[theme] as CSSProperties}
    >
      <Modal>
        <Dialog aria-label={ariaLabel}>
          {({ close }) => (
            <>
              {content}
              <Button onPress={close}>Cerrar navegación</Button>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  ) : (
    content
  );
}

/**
 * Groups branding or leading controls in the sidebar.
 * @param props - Semantic header attributes and composed content.
 * @returns The sidebar header slot.
 */
export function SidebarHeader({
  className,
  ...props
}: ComponentPropsWithoutRef<"header">) {
  return (
    <header
      {...props}
      className={classNames("kt-sidebar__header", className)}
    />
  );
}

/**
 * Provides a semantic navigation region without selecting routes.
 * @param props - Navigation attributes and items.
 * @returns A sidebar navigation container.
 */
export function SidebarNav({
  className,
  ...props
}: ComponentPropsWithoutRef<"nav">) {
  return (
    <nav {...props} className={classNames("kt-sidebar__nav", className)} />
  );
}

export interface SidebarSectionProps extends ComponentPropsWithoutRef<"section"> {
  readonly label?: string;
}

/**
 * Groups related navigation entries under a presentation label.
 * @param props - Label, section attributes and composed items.
 * @returns A labeled sidebar section.
 */
export function SidebarSection({
  children,
  className,
  label,
  ...props
}: SidebarSectionProps) {
  return (
    <section
      {...props}
      className={classNames("kt-sidebar__section", className)}
    >
      {label ? <h2 className="kt-sidebar__section-label">{label}</h2> : null}
      <div className="kt-sidebar__section-items">{children}</div>
    </section>
  );
}

interface SidebarItemContentProps {
  readonly active?: boolean;
  readonly badge?: ReactNode;
  readonly icon?: ReactNode;
  readonly label: string;
}
function SidebarItemContent({ badge, icon, label }: SidebarItemContentProps) {
  return (
    <>
      <Text className="kt-sidebar__item-icon" aria-hidden="true">
        {icon}
      </Text>
      <Text className="kt-sidebar__item-label">{label}</Text>
      {badge ? <Text className="kt-sidebar__item-badge">{badge}</Text> : null}
    </>
  );
}
export interface SidebarActionProps
  extends Omit<ButtonProps, "children">, SidebarItemContentProps {}

/**
 * Renders a navigation action whose effect is supplied by the consumer.
 * @param props - Label, active state, visual slots and action callback.
 * @returns A keyboard-accessible sidebar button.
 */
export function SidebarAction({
  active = false,
  badge,
  className,
  icon,
  label,
  ...props
}: SidebarActionProps) {
  return (
    <Button
      {...props}
      appearance="unstyled"
      title={label}
      aria-current={active ? "page" : undefined}
      className={classNames(
        "kt-sidebar__item",
        active && "kt-sidebar__item--active",
        className,
      )}
    >
      <SidebarItemContent badge={badge} icon={icon} label={label} />
    </Button>
  );
}
export interface SidebarLinkProps
  extends
    Omit<ComponentPropsWithoutRef<"a">, "children">,
    SidebarItemContentProps {
  readonly onPress?: () => void;
}

/**
 * Renders a supplied URL or navigation callback with link semantics.
 * @param props - Destination, label, active state and optional action override.
 * @returns A sidebar link; the library does not interpret or construct its destination.
 */
export function SidebarLink({
  active = false,
  badge,
  className,
  icon,
  label,
  onPress,
  onClick,
  ...props
}: SidebarLinkProps) {
  return (
    <a
      {...props}
      title={label}
      aria-current={active ? "page" : undefined}
      role={props.href ? undefined : "link"}
      tabIndex={props.href ? props.tabIndex : 0}
      onKeyDown={(event) => {
        props.onKeyDown?.(event);
        if (!event.defaultPrevented && !props.href && event.key === "Enter")
          onPress?.();
      }}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && onPress) {
          event.preventDefault();
          onPress();
        }
      }}
      className={classNames(
        "kt-sidebar__item",
        active && "kt-sidebar__item--active",
        className,
      )}
    >
      <SidebarItemContent badge={badge} icon={icon} label={label} />
    </a>
  );
}

/**
 * Groups trailing content without assigning account or workspace meaning.
 * @param props - Footer attributes and composed content.
 * @returns The sidebar footer slot.
 */
export function SidebarFooter({
  className,
  ...props
}: ComponentPropsWithoutRef<"footer">) {
  return (
    <footer
      {...props}
      className={classNames("kt-sidebar__footer", className)}
    />
  );
}
