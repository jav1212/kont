import { useState, type ReactNode } from "react";
import {
  ArrowRight, Building2, CreditCard, FileText, MonitorCog, Palette, ShieldCheck,
  UserRound, UsersRound,
} from "lucide-react";
import type { SettingsAvailability } from "@kontave/settings-application";
import type { SettingsEntryId, SettingsIconKey, SettingsSectionId } from "@kontave/settings-contracts";
import type { NavigationDestinationId } from "@kontave/navigation-domain";

export interface DesktopSettingsEntry {
  readonly id: SettingsEntryId;
  readonly label: string;
  readonly description: string;
  readonly iconKey: SettingsIconKey;
  readonly destination: NavigationDestinationId;
  readonly availability: SettingsAvailability;
}

export interface DesktopSettingsSection {
  readonly id: SettingsSectionId;
  readonly label: string;
  readonly entries: readonly DesktopSettingsEntry[];
}

export interface DesktopSettingsViewProps {
  readonly sections: readonly DesktopSettingsSection[];
  readonly onSelect: (id: SettingsEntryId) => void;
}

export function DesktopSettingsView({ onSelect, sections }: DesktopSettingsViewProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizeSearch(query);
  const visibleSections = normalizedQuery
    ? sections.map((section) => ({
      ...section,
      entries: section.entries.filter((entry) => normalizeSearch(`${entry.label} ${entry.description}`).includes(normalizedQuery)),
    })).filter((section) => section.entries.length > 0)
    : sections;

  return <section className="desktop-settings" aria-labelledby="desktop-settings-title">
    <header className="desktop-settings__heading">
      <h2 id="desktop-settings-title">Configuración</h2>
      <p>Administra tu cuenta, organización, empresa y preferencias de Kontave.</p>
    </header>

    <label className="desktop-settings-search">
      <span className="sr-only">Buscar configuración</span>
      <SearchIcon />
      <input type="search" value={query} placeholder="Buscar configuración..." onChange={(event) => setQuery(event.target.value)} />
    </label>

    {visibleSections.length > 0 ? <div className="desktop-settings__sections">
      {visibleSections.map((section) => <section className="desktop-settings-section" key={section.id}>
        <h3>{section.label}</h3>
        <div className="desktop-settings-list">
          {section.entries.map((entry) => <button
            className="desktop-settings-row"
            data-availability={entry.availability}
            disabled={entry.availability === "disabled"}
            key={entry.id}
            type="button"
            onClick={() => onSelect(entry.id)}
          >
            <span className="desktop-settings-row__icon" aria-hidden="true">{settingsIcon(entry.iconKey)}</span>
            <span className="desktop-settings-row__copy">
              <strong>{entry.label}</strong>
              <span>{entry.description}</span>
            </span>
            {entry.availability === "read_only" ? <span className="desktop-settings-row__mode">Sólo lectura</span> : null}
            <ArrowRight className="desktop-settings-row__arrow" aria-hidden="true" />
          </button>)}
        </div>
      </section>)}
    </div> : <p className="desktop-settings__empty">No encontramos configuraciones para “{query.trim()}”.</p>}
  </section>;
}

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" />
  </svg>;
}

function settingsIcon(key: SettingsIconKey): ReactNode {
  if (key === "profile") return <UserRound />;
  if (key === "appearance") return <Palette />;
  if (key === "security") return <ShieldCheck />;
  if (key === "organization") return <Building2 />;
  if (key === "members") return <UsersRound />;
  if (key === "roles") return <ShieldCheck />;
  if (key === "billing") return <CreditCard />;
  if (key === "documents") return <FileText />;
  return <MonitorCog />;
}

function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}
