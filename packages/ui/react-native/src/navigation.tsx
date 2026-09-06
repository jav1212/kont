import { createContext, useContext, type ReactNode } from "react";
import { Linking, ScrollView, View, type ViewProps } from "react-native";
import { Button, type ButtonProps } from "./button";
import { ModalSurface } from "./modal-surface";
import { Text } from "./typography";
import { useUiTheme } from "./theme";

export interface BreadcrumbItem {
  readonly id: string;
  readonly label: string;
  readonly current?: boolean;
}
export interface BreadcrumbsProps {
  readonly items: readonly BreadcrumbItem[];
  readonly ariaLabel?: string;
  readonly onNavigate?: (id: string) => void;
}

/**
 * Presents a navigation trail whose destinations are owned by the consumer.
 * @param props - Ordered items and optional navigation callback.
 * @returns Accessible breadcrumb actions; current entries are noninteractive.
 */
export function Breadcrumbs({
  items,
  ariaLabel = "Ruta de navegación",
  onNavigate,
}: BreadcrumbsProps) {
  if (!items.length) return null;
  return (
    <View
      accessibilityLabel={ariaLabel}
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
      }}
    >
      {items.map((item, index) => (
        <View
          key={item.id}
          style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          {index > 0 ? (
            <Text accessibilityElementsHidden importantForAccessibility="no">
              /
            </Text>
          ) : null}
          {item.current || !onNavigate ? (
            <Text
              accessibilityLabel={
                item.current ? `${item.label}, actual` : item.label
              }
            >
              {item.label}
            </Text>
          ) : (
            <Button appearance="text" onPress={() => onNavigate(item.id)}>
              {item.label}
            </Button>
          )}
        </View>
      ))}
    </View>
  );
}

export type SidebarPresentation = "expanded" | "collapsed" | "overlay";
export interface SidebarProps extends ViewProps {
  readonly presentation?: SidebarPresentation;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly ariaLabel?: string;
}
const PresentationContext = createContext<SidebarPresentation>("expanded");

/**
 * Composes generic navigation as an expanded rail, compact rail or controlled modal.
 * @param props - Navigation content, presentation and controlled overlay visibility.
 * @returns A native sidebar; route and account state remain outside the component.
 */
export function Sidebar({
  children,
  presentation = "expanded",
  open = false,
  onOpenChange,
  ariaLabel = "Navegación",
  style,
  ...props
}: SidebarProps) {
  const { colors } = useUiTheme();
  const content = (
    <PresentationContext.Provider value={presentation}>
      <View
        {...props}
        style={[
          {
            backgroundColor: colors.surface,
            borderRightWidth: 1,
            borderColor: colors.border,
            width:
              presentation === "collapsed"
                ? 72
                : presentation === "overlay"
                  ? "100%"
                  : 280,
            padding: 12,
            gap: 12,
          },
          style,
        ]}
      >
        {children}
      </View>
    </PresentationContext.Provider>
  );
  return presentation === "overlay" ? (
    <ModalSurface
      title={ariaLabel}
      open={open}
      onClose={() => onOpenChange?.(false)}
    >
      {content}
    </ModalSurface>
  ) : (
    content
  );
}

/**
 * Groups sidebar branding or leading content.
 * @param props - Native header container and content.
 * @returns A header slot independent of application identity data.
 */
export function SidebarHeader(props: ViewProps) {
  return <View {...props} />;
}

/**
 * Provides independently scrollable sidebar navigation.
 * @param props - Navigation container props and items.
 * @returns A scrollable native navigation region.
 */
export function SidebarNav(props: ViewProps) {
  return <ScrollView {...props} />;
}

export interface SidebarSectionProps extends ViewProps {
  readonly label?: string;
}

/**
 * Groups sidebar items beneath an optional presentation label.
 * @param props - Section label, items and native container options.
 * @returns A labeled group, with its label hidden in compact presentation.
 */
export function SidebarSection({
  label,
  children,
  ...props
}: SidebarSectionProps) {
  const presentation = useContext(PresentationContext);
  return (
    <View {...props}>
      {label && presentation !== "collapsed" ? (
        <Text tone="muted" as="small">
          {label}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export interface SidebarActionProps extends Omit<ButtonProps, "children"> {
  readonly label: string;
  readonly active?: boolean;
  readonly icon?: ReactNode;
  readonly badge?: ReactNode;
}

/**
 * Exposes a labeled navigation action without deciding where it leads.
 * @param props - Label, optional icon/badge, active state and press callback.
 * @returns A touch-sized sidebar action with selected accessibility state.
 */
export function SidebarAction({
  label,
  active = false,
  icon,
  badge,
  style,
  ...props
}: SidebarActionProps) {
  const { colors } = useUiTheme();
  const compact = useContext(PresentationContext) === "collapsed";
  return (
    <Button
      {...props}
      appearance="unstyled"
      accessibilityLabel={props.accessibilityLabel ?? label}
      accessibilityState={{ ...props.accessibilityState, selected: active }}
      style={(state) => [
        {
          paddingHorizontal: 8,
          borderRadius: 8,
          justifyContent: compact ? "center" : "flex-start",
          backgroundColor: active ? colors.primarySoft : "transparent",
        },
        typeof style === "function" ? style(state) : style,
      ]}
    >
      {icon}
      {compact && icon ? null : <Text style={{ flex: 1 }}>{label}</Text>}
      {compact ? null : badge}
    </Button>
  );
}

export interface SidebarLinkProps extends SidebarActionProps {
  readonly href?: string;
  readonly onOpenError?: (cause: unknown) => void;
}

/**
 * Activates a supplied navigation callback or opens a supplied platform URL.
 * @param props - Link appearance, URL or overriding action, and optional failure handler.
 * @returns A native link; URL-opening failures are delivered to onOpenError.
 */
export function SidebarLink({
  href,
  onPress,
  onOpenError,
  ...props
}: SidebarLinkProps) {
  return (
    <SidebarAction
      {...props}
      accessibilityRole="link"
      disabled={props.disabled || (!onPress && !href)}
      onPress={() => {
        if (onPress) onPress();
        else if (href)
          void Linking.openURL(href).catch((cause: unknown) =>
            onOpenError?.(cause),
          );
      }}
    />
  );
}

/**
 * Groups trailing navigation content without assigning business meaning.
 * @param props - Footer container and composed content.
 * @returns A native footer slot.
 */
export function SidebarFooter(props: ViewProps) {
  return <View {...props} />;
}
