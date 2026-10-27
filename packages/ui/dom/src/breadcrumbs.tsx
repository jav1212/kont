import { Button } from "./button";
import { Text } from "./text";
export interface BreadcrumbItem {
  /** Stable navigation destination key. */
  readonly id: string;
  /** Visible name of the destination. */
  readonly label: string;
  /** Marks the current page, which is rendered as noninteractive text. */
  readonly current?: boolean;
  /** Canonical path for native anchor navigation. */
  readonly href?: string;
  /** Optional host layout classes for this list item. */
  readonly className?: string;
  /** Optional host layout classes applied to the truncatable label. */
  readonly labelClassName?: string;
  /** Optional decorative content rendered before the item label. */
  readonly prefix?: React.ReactNode;
  /** Optional interactive disclosure for collapsed intermediate destinations. */
  readonly overflowContent?: React.ReactNode;
}

/** Component contract for rendering a real navigable breadcrumb anchor. */
export interface BreadcrumbLinkProps {
  /** Internal destination path. */
  readonly href: string;
  /** Presentation classes supplied by the component. */
  readonly className?: string;
  /** Full item label for a host tooltip. */
  readonly title?: string;
  /** Link contents, including any decorative prefix. */
  readonly children: React.ReactNode;
}

export interface BreadcrumbsProps {
  /** Ordered destination list from root to current page. */
  readonly items: readonly BreadcrumbItem[];
  /** Accessible name for the navigation landmark. */
  readonly ariaLabel?: string;
  /** Optional callback for clients that navigate by destination identifier. */
  readonly onNavigate?: (id: string) => void;
  /** Host router anchor renderer; keeps this package independent of a router. */
  readonly linkComponent?: (props: BreadcrumbLinkProps) => React.ReactNode;
  /** Optional host layout classes for the navigation landmark. */
  readonly className?: string;
  /** Optional host layout classes for the ordered list. */
  readonly listClassName?: string;
}

/**
 * Displays a navigation trail without resolving application routes.
 * @param props - Ordered navigation items and an optional consumer callback.
 * @returns A semantic breadcrumb trail; the current item is noninteractive.
 */
export function Breadcrumbs({
  ariaLabel = "Ruta de navegación",
  items,
  onNavigate,
  linkComponent,
  className,
  listClassName,
}: BreadcrumbsProps) {
  if (items.length === 0) return null;
  return (
    <nav className={["kt-breadcrumbs", className].filter(Boolean).join(" ")} aria-label={ariaLabel}>
      <ol className={["kt-breadcrumbs__list", listClassName].filter(Boolean).join(" ")}>
        {items.map((item, index) => (
          <li className={["kt-breadcrumbs__item", item.className].filter(Boolean).join(" ")} key={item.id}>
            {index > 0 ? (
              <Text className="kt-breadcrumbs__separator" aria-hidden="true">
                /
              </Text>
            ) : null}
            {item.overflowContent ? item.overflowContent : !item.current && item.href && linkComponent ? (
              linkComponent({ href: item.href, className: "kt-breadcrumbs__link", title: item.label, children: <>{item.prefix}<span className={["kt-breadcrumbs__label", item.labelClassName].filter(Boolean).join(" ")}>{item.label}</span></> })
            ) : !item.current && onNavigate ? (
              <Button
                appearance="unstyled"
                className="kt-breadcrumbs__link"
                type="button"
                onPress={() => onNavigate(item.id)}
              >
                {item.prefix}{item.label}
              </Button>
            ) : (
              <Text
                className="kt-breadcrumbs__label"
                title={item.label}
                aria-current={item.current ? "page" : undefined}
              >
                {item.label}
              </Text>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
