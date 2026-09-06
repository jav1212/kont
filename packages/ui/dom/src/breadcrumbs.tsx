import { Button } from "./button";
import { Text } from "./text";
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
 * Displays a navigation trail without resolving application routes.
 * @param props - Ordered navigation items and an optional consumer callback.
 * @returns A semantic breadcrumb trail; the current item is noninteractive.
 */
export function Breadcrumbs({
  ariaLabel = "Ruta de navegación",
  items,
  onNavigate,
}: BreadcrumbsProps) {
  if (items.length === 0) return null;
  return (
    <nav className="kt-breadcrumbs" aria-label={ariaLabel}>
      <ol className="kt-breadcrumbs__list">
        {items.map((item, index) => (
          <li className="kt-breadcrumbs__item" key={item.id}>
            {index > 0 ? (
              <Text className="kt-breadcrumbs__separator" aria-hidden="true">
                /
              </Text>
            ) : null}
            {!item.current && onNavigate ? (
              <Button
                appearance="unstyled"
                className="kt-breadcrumbs__link"
                type="button"
                onPress={() => onNavigate(item.id)}
              >
                {item.label}
              </Button>
            ) : (
              <Text
                className="kt-breadcrumbs__label"
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
