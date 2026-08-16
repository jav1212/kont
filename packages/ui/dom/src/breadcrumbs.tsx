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

/** Responsive, presentation-only breadcrumbs for DOM clients. */
export function Breadcrumbs({ ariaLabel = "Ruta de navegación", items, onNavigate }: BreadcrumbsProps) {
  if (items.length === 0) return null;
  return <nav className="kt-breadcrumbs" aria-label={ariaLabel}>
    <ol className="kt-breadcrumbs__list">
      {items.map((item, index) => <li className="kt-breadcrumbs__item" key={item.id}>
        {index > 0 ? <span className="kt-breadcrumbs__separator" aria-hidden="true">/</span> : null}
        {!item.current && onNavigate ? <button
          className="kt-breadcrumbs__link"
          type="button"
          onClick={() => onNavigate(item.id)}
        >{item.label}</button> : <span
          className="kt-breadcrumbs__label"
          aria-current={item.current ? "page" : undefined}
        >{item.label}</span>}
      </li>)}
    </ol>
  </nav>;
}
