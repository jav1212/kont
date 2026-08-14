import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./button.js";
import { LogoFull, LogoMark } from "./logo.js";
import { classNames } from "./internal/class-names.js";
import { Text } from "./text.js";

export type WorkspaceSidebarPresentation = "persistent" | "collapsed" | "drawer";

export interface WorkspaceSidebarModule {
  readonly id: string;
  readonly label: string;
  readonly subtitle?: string;
  readonly icon?: ReactNode;
}

export interface WorkspaceSidebarCompany {
  readonly id: string;
  readonly name: string;
  readonly subtitle?: string;
  readonly logoUrl?: string;
}

export interface WorkspaceSidebarItem {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly active?: boolean;
  readonly badge?: ReactNode;
  readonly hierarchy?: "root" | "child";
  readonly startsGroup?: boolean;
}

export interface WorkspaceSidebarSection {
  readonly id: string;
  readonly label?: string;
  readonly items: readonly WorkspaceSidebarItem[];
}

export interface WorkspaceSidebarAccount {
  readonly name: string;
  readonly email?: string;
  readonly planName?: string;
  readonly avatarUrl?: string;
  readonly workspaces?: readonly WorkspaceSidebarWorkspace[];
  readonly activeWorkspaceId?: string | null;
  readonly theme?: "light" | "dark";
  readonly workspaceSectionLabel?: string;
}

export interface WorkspaceSidebarWorkspace {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly badge?: string;
  readonly avatarUrl?: string;
}

export interface WorkspaceSidebarAccountAction {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly tone?: "default" | "danger";
  readonly placement?: "header" | "menu" | "billing" | "status";
  readonly indicator?: ReactNode;
}

export interface WorkspaceSidebarProps {
  readonly presentation?: WorkspaceSidebarPresentation;
  readonly open?: boolean;
  readonly modules: readonly WorkspaceSidebarModule[];
  readonly activeModuleId: string | null;
  readonly companies?: readonly WorkspaceSidebarCompany[];
  readonly activeCompanyId?: string | null;
  readonly sections: readonly WorkspaceSidebarSection[];
  readonly utilities?: readonly WorkspaceSidebarItem[];
  readonly account: WorkspaceSidebarAccount;
  readonly accountActions?: readonly WorkspaceSidebarAccountAction[];
  readonly footerSlot?: ReactNode;
  readonly closeIcon?: ReactNode;
  readonly className?: string;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onSelectModule?: (moduleId: string) => void;
  readonly onSelectCompany?: (companyId: string) => void;
  readonly onNavigate?: (itemId: string) => void;
  readonly onAccountAction?: (actionId: string) => void;
  readonly onSelectWorkspace?: (workspaceId: string) => void;
  readonly onThemeChange?: (theme: "light" | "dark") => void;
}

export function WorkspaceSidebar({
  account,
  accountActions = [],
  activeCompanyId = null,
  activeModuleId,
  className,
  closeIcon,
  companies = [],
  footerSlot,
  modules,
  onAccountAction,
  onNavigate,
  onOpenChange,
  onSelectCompany,
  onSelectModule,
  onSelectWorkspace,
  onThemeChange,
  open = false,
  presentation = "persistent",
  sections,
  utilities = [],
}: WorkspaceSidebarProps) {
  const compact = presentation === "collapsed";
  const activeModule = modules.find(({ id }) => id === activeModuleId) ?? modules[0] ?? null;
  const activeCompany = companies.find(({ id }) => id === activeCompanyId) ?? companies[0] ?? null;

  return <aside
    aria-label="Navegación principal"
    className={classNames("kt-workspace-sidebar", className)}
    data-open={open}
    data-presentation={presentation}
  >
    <header className="kt-workspace-sidebar__header">
      {compact ? <LogoMark size={25} /> : <LogoFull size={25} />}
      {presentation === "drawer" ? <Button
        appearance="unstyled"
        className="kt-workspace-sidebar__icon-button"
        aria-label="Cerrar navegación"
        onClick={() => onOpenChange?.(false)}
      >{closeIcon ?? <CloseIcon />}</Button> : null}
    </header>

    {!compact ? <div className="kt-workspace-sidebar__context">
      <Selector
        kind="module"
        items={modules}
        selected={activeModule}
        emptyLabel="Seleccionar módulo"
        onSelect={onSelectModule}
      />
      {companies.length > 0 ? <Selector
        kind="company"
        items={companies}
        selected={activeCompany}
        emptyLabel="Seleccionar empresa"
        onSelect={onSelectCompany}
      /> : null}
    </div> : null}

    <nav className="kt-workspace-sidebar__navigation" aria-label="Secciones del módulo">
      {sections.map((section) => <section className="kt-workspace-sidebar__section" key={section.id}>
        {section.label && !compact ? <h2>{section.label}</h2> : null}
        {section.items.map((item) => <NavigationItem
          compact={compact}
          item={item}
          key={item.id}
          onSelect={onNavigate}
        />)}
      </section>)}
    </nav>

    <footer className="kt-workspace-sidebar__footer">
      {!compact ? footerSlot : null}
      {utilities.length > 0 ? <div className="kt-workspace-sidebar__utilities">
        {utilities.map((item) => <NavigationItem compact={compact} item={item} key={item.id} onSelect={onNavigate} />)}
      </div> : null}
      <AccountCard
        account={account}
        actions={accountActions}
        compact={compact}
        onAction={onAccountAction}
        onSelectWorkspace={onSelectWorkspace}
        onThemeChange={onThemeChange}
      />
    </footer>
  </aside>;
}

type SelectorEntry = WorkspaceSidebarModule | WorkspaceSidebarCompany;

function Selector<TEntry extends SelectorEntry>({
  emptyLabel,
  items,
  kind,
  onSelect,
  selected,
}: {
  readonly emptyLabel: string;
  readonly items: readonly TEntry[];
  readonly kind: "module" | "company";
  readonly onSelect?: ((id: string) => void) | undefined;
  readonly selected: TEntry | null;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useDismissibleMenu<HTMLDivElement>(open, () => setOpen(false));
  const label = kind === "module" ? "Módulo" : "Empresa";

  return <div className="kt-sidebar-selector" ref={containerRef}>
    <Button
      appearance="unstyled"
      className="kt-sidebar-selector__trigger"
      aria-expanded={open}
      aria-haspopup="listbox"
      onClick={() => setOpen((current) => !current)}
    >
      <SelectorAvatar entry={selected} kind={kind} />
      <Text className="kt-sidebar-selector__copy" tone="inherit">
        <Text as="strong" tone="inherit">{selected ? selectorEntryLabel(selected) : emptyLabel}</Text>
        {selected?.subtitle ? <Text as="small" tone="inherit">{selected.subtitle}</Text> : null}
      </Text>
      <ChevronIcon open={open} />
    </Button>
    {open ? <div className="kt-sidebar-menu" role="listbox" aria-label={`${label}s disponibles`}>
      {items.map((item) => {
        const itemLabel = "label" in item ? item.label : item.name;
        const active = item.id === selected?.id;
        return <Button
          appearance="unstyled"
          className="kt-sidebar-menu__option"
          data-active={active}
          role="option"
          aria-selected={active}
          key={item.id}
          onClick={() => {
            onSelect?.(item.id);
            setOpen(false);
          }}
        >
          <SelectorAvatar entry={item} kind={kind} small />
          <Text className="kt-sidebar-menu__option-copy" tone="inherit">
            <Text as="strong" tone="inherit">{itemLabel}</Text>
            {item.subtitle ? <Text as="small" tone="inherit">{item.subtitle}</Text> : null}
          </Text>
          {active ? <CheckIcon /> : null}
        </Button>;
      })}
    </div> : null}
  </div>;
}

function SelectorAvatar({ entry, kind, small = false }: {
  readonly entry: SelectorEntry | null;
  readonly kind: "module" | "company";
  readonly small?: boolean;
}) {
  if (kind === "module") {
    return <Text className="kt-sidebar-selector__avatar" data-small={small} tone="inherit" aria-hidden="true">
      {(entry as WorkspaceSidebarModule | null)?.icon ?? <ModuleIcon />}
    </Text>;
  }

  const company = entry as WorkspaceSidebarCompany | null;
  const initial = company?.name.trim().charAt(0).toLocaleUpperCase("es") || "?";
  return <Text className="kt-sidebar-selector__avatar kt-sidebar-selector__avatar--company" data-small={small} tone="inherit" aria-hidden="true">
    {company?.logoUrl ? <img alt="" src={company.logoUrl} /> : initial}
  </Text>;
}

function NavigationItem({ compact, item, onSelect }: {
  readonly compact: boolean;
  readonly item: WorkspaceSidebarItem;
  readonly onSelect?: ((id: string) => void) | undefined;
}) {
  return <div className="kt-workspace-sidebar__item-wrap" data-group-start={item.startsGroup === true}>
    <Button
      appearance="unstyled"
      title={compact ? item.label : undefined}
      aria-current={item.active ? "page" : undefined}
      className="kt-workspace-sidebar__item"
      data-active={item.active === true}
      data-hierarchy={item.hierarchy ?? "root"}
      onClick={() => onSelect?.(item.id)}
    >
      {item.active ? <Text className="kt-workspace-sidebar__active-bar" tone="inherit" aria-hidden="true" /> : null}
      <Text className="kt-workspace-sidebar__item-icon" tone="inherit" aria-hidden="true">{item.icon}</Text>
      {!compact ? <Text className="kt-workspace-sidebar__item-label" tone="inherit">{item.label}</Text> : null}
      {!compact && item.badge ? <Text className="kt-workspace-sidebar__item-badge" tone="inherit">{item.badge}</Text> : null}
    </Button>
  </div>;
}

function AccountCard({ account, actions, compact, onAction, onSelectWorkspace, onThemeChange }: {
  readonly account: WorkspaceSidebarAccount;
  readonly actions: readonly WorkspaceSidebarAccountAction[];
  readonly compact: boolean;
  readonly onAction?: ((actionId: string) => void) | undefined;
  readonly onSelectWorkspace?: ((workspaceId: string) => void) | undefined;
  readonly onThemeChange?: ((theme: "light" | "dark") => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useDismissibleMenu<HTMLDivElement>(open, () => setOpen(false));
  const initial = account.name.trim().charAt(0).toLocaleUpperCase("es") || account.email?.charAt(0).toUpperCase() || "?";
  const workspaces = account.workspaces ?? [];
  const activeWorkspace = workspaces.find((workspace) => workspace.id === account.activeWorkspaceId);
  const triggerName = activeWorkspace?.name ?? account.name;
  const triggerDescription = activeWorkspace?.description ?? account.email;
  const triggerAvatarUrl = activeWorkspace?.avatarUrl ?? account.avatarUrl;
  const triggerInitial = triggerName.trim().charAt(0).toLocaleUpperCase("es") || initial;
  const headerActions = actions.filter((action) => action.placement === "header");
  const menuActions = actions.filter((action) => !action.placement || action.placement === "menu");
  const billingActions = actions.filter((action) => action.placement === "billing");
  const statusActions = actions.filter((action) => action.placement === "status");
  const hasMenuContent = actions.length > 0 || workspaces.length > 1 || account.theme !== undefined;

  return <div className="kt-sidebar-account" ref={containerRef}>
    <Button
      appearance="unstyled"
      className="kt-sidebar-account__trigger"
      title={compact ? triggerName : undefined}
      aria-label={`Cuenta: ${triggerName}. Abrir menú`}
      aria-expanded={open}
      aria-haspopup="menu"
      onClick={() => setOpen((current) => !current)}
    >
      <Text className="kt-sidebar-account__avatar" tone="inherit" aria-hidden="true">
        {triggerAvatarUrl ? <img alt="" src={triggerAvatarUrl} /> : triggerInitial}
      </Text>
      {!compact ? <Text className="kt-sidebar-account__copy" tone="inherit">
        <Text as="strong" tone="inherit">{triggerName}</Text>
        {triggerDescription ? <Text as="small" tone="inherit">{triggerDescription}</Text> : null}
      </Text> : null}
      {!compact ? <UpChevronIcon /> : null}
    </Button>
    {open && hasMenuContent ? <div className="kt-sidebar-account__menu" role="menu">
      <div className="kt-sidebar-account__summary-row">
        <div className="kt-sidebar-account__summary">
          <Text as="strong" tone="inherit">{account.name}</Text>
          {account.email ? <Text as="small" tone="inherit">{account.email}</Text> : null}
          {account.planName ? <Text tone="inherit">{account.planName}</Text> : null}
        </div>
        {headerActions.map((action) => <AccountActionButton action={action} iconOnly key={action.id} onAction={onAction} close={() => setOpen(false)} />)}
      </div>
      {workspaces.length > 1 ? <div className="kt-sidebar-account__workspace-section">
        <Text as="p" tone="inherit">{account.workspaceSectionLabel ?? "Cambiar espacio"}</Text>
        {workspaces.map((workspace) => {
          const selected = workspace.id === account.activeWorkspaceId;
          const workspaceInitial = workspace.name.trim().charAt(0).toLocaleUpperCase("es") || "?";
          return <Button
            appearance="unstyled"
            className="kt-sidebar-account__workspace"
            role="menuitemradio"
            aria-checked={selected}
            data-active={selected}
            key={workspace.id}
            onClick={() => {
              onSelectWorkspace?.(workspace.id);
              setOpen(false);
            }}
          >
            <Text className="kt-sidebar-account__workspace-avatar" tone="inherit" aria-hidden="true">
              {workspace.avatarUrl ? <img alt="" src={workspace.avatarUrl} /> : workspaceInitial}
            </Text>
            <Text className="kt-sidebar-account__workspace-copy" tone="inherit">
              <Text as="strong" tone="inherit">{workspace.name}</Text>
              {workspace.description ? <Text as="small" tone="inherit">{workspace.description}</Text> : null}
            </Text>
            {workspace.badge ? <Text className="kt-sidebar-account__workspace-badge" tone="inherit">{workspace.badge}</Text> : null}
            {selected ? <CheckIcon /> : null}
          </Button>;
        })}
      </div> : null}
      {account.theme ? <div className="kt-sidebar-account__preferences">
        <div className="kt-sidebar-account__theme-row">
          <Text tone="inherit">Tema</Text>
          <div className="kt-sidebar-account__theme-controls">
            <Button appearance="unstyled" aria-label="Usar tema claro" aria-pressed={account.theme === "light"} data-active={account.theme === "light"} onClick={() => onThemeChange?.("light")}><SunIcon /></Button>
            <Button appearance="unstyled" aria-label="Usar tema oscuro" aria-pressed={account.theme === "dark"} data-active={account.theme === "dark"} onClick={() => onThemeChange?.("dark")}><MoonIcon /></Button>
          </div>
        </div>
        {menuActions.map((action) => <AccountActionButton action={action} key={action.id} onAction={onAction} close={() => setOpen(false)} />)}
      </div> : menuActions.map((action) => <AccountActionButton action={action} key={action.id} onAction={onAction} close={() => setOpen(false)} />)}
      {billingActions.length > 0 ? <div className="kt-sidebar-account__billing">
        {billingActions.map((action) => <AccountActionButton action={action} key={action.id} onAction={onAction} close={() => setOpen(false)} />)}
      </div> : null}
      {statusActions.map((action) => <AccountActionButton action={action} key={action.id} onAction={onAction} close={() => setOpen(false)} />)}
    </div> : null}
  </div>;
}

function AccountActionButton({ action, close, iconOnly = false, onAction }: {
  readonly action: WorkspaceSidebarAccountAction;
  readonly close: () => void;
  readonly iconOnly?: boolean;
  readonly onAction?: ((actionId: string) => void) | undefined;
}) {
  return <Button
    appearance="unstyled"
    className={classNames("kt-sidebar-account__action", iconOnly && "kt-sidebar-account__action--icon")}
    role="menuitem"
    aria-label={iconOnly ? action.label : undefined}
    data-placement={action.placement ?? "menu"}
    data-tone={action.tone ?? "default"}
    onClick={() => {
      onAction?.(action.id);
      close();
    }}
  >
    <Text tone="inherit" aria-hidden="true">{action.icon}</Text>
    {!iconOnly ? action.label : null}
    {!iconOnly && action.indicator ? <Text className="kt-sidebar-account__action-indicator" tone="inherit" aria-hidden="true">{action.indicator}</Text> : null}
  </Button>;
}

function useDismissibleMenu<TElement extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<TElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent): void {
      if (!ref.current?.contains(event.target as Node)) closeRef.current();
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") closeRef.current();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return ref;
}

function selectorEntryLabel(entry: SelectorEntry): string {
  return "label" in entry ? entry.label : entry.name;
}

function ChevronIcon({ open }: { readonly open: boolean }) {
  return <svg className="kt-sidebar-chevron" data-open={open} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path d="m4.5 6 3.5 3.5L11.5 6" />
  </svg>;
}

function CheckIcon() {
  return <svg className="kt-sidebar-check" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m3 8.5 3 3 7-7" /></svg>;
}

function UpChevronIcon() {
  return <svg className="kt-sidebar-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m4.5 10 3.5-3.5 3.5 3.5" /></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>;
}

function ModuleIcon() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></svg>;
}

function SunIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10" cy="10" r="3" /><path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6 16 16M16 4l-1.4 1.4M5.4 14.6 4 16" /></svg>;
}

function MoonIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M16.5 12.6A7 7 0 0 1 7.4 3.5a7 7 0 1 0 9.1 9.1Z" /></svg>;
}
