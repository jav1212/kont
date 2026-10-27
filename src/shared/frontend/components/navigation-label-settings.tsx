"use client";

import { useEffect, useState } from "react";
import { SettingsSection } from "@/src/shared/frontend/components/settings-section";
import { APP_MODULES, MODULE_SUBNAV, WEB_SETTINGS_MODULE, navigationDestinationFor } from "@/src/shared/frontend/navigation";
import { ApiRequestFailure } from "@/src/shared/frontend/feedback/api-request-failure";

const MODULES = [
    ["payroll", "Nómina"], ["purchases", "Compras"], ["sales", "Ventas"],
    ["inventory", "Inventario"], ["accounting", "Contabilidad"], ["tools", "Herramientas"], ["companies", "Empresas"], ["documents", "Documentos"], ["settings", "Configuración"],
] as const;
const LABEL_GROUPS = [
    ...APP_MODULES.filter((module) => !("parentId" in module)).map((module) => ({ id: module.id, title: module.label })),
    { id: WEB_SETTINGS_MODULE.id, title: WEB_SETTINGS_MODULE.label },
].flatMap((module) => {
    const destinations = Array.from(new Map((MODULE_SUBNAV[module.id] ?? []).flatMap((item) => {
        const id = navigationDestinationFor(module.id, item.href);
        return id && id !== module.id ? [[id, item.label] as const] : [];
    })).entries());
    return destinations.length ? [{ ...module, destinations }] : [];
});
const ICON_OPTIONS = [
    ["activity", "Actividad"], ["archive", "Archivo"], ["book", "Libro"], ["briefcase", "Maletín"],
    ["building", "Edificio"], ["calendar", "Calendario"], ["chart", "Gráfico"], ["clipboard", "Portapapeles"],
    ["coins", "Monedas"], ["credit-card", "Tarjeta"], ["document", "Documento"], ["folder", "Carpeta"],
    ["home", "Inicio"], ["inventory", "Inventario"], ["people", "Personas"], ["receipt", "Recibo"],
    ["settings", "Ajustes"], ["shield", "Seguridad"], ["shopping-cart", "Compras"], ["tool", "Herramienta"],
    ["truck", "Transporte"], ["user", "Usuario"], ["wallet", "Billetera"],
] as const;

/** Lets the signed-in user rename the Web workspace menu using stable catalog IDs.
 * @returns An editor with validation and optimistic concurrency feedback.
 */
export function NavigationLabelSettings() {
    const [version, setVersion] = useState(0);
    const [labels, setLabels] = useState<Record<string, string>>({});
    const [status, setStatus] = useState("Cargando preferencias…");
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        let current = true;
        void fetch("/api/preferences/navigation-labels", { cache: "no-store" }).then(async (response) => {
            if (!response.ok) throw new ApiRequestFailure(response, "No se pudieron cargar las etiquetas del menú.");
            return response.json();
        }).then((payload) => {
            if (!current) return;
            setVersion(payload.data.version);
            setLabels(payload.data.labels);
            setStatus("");
        }).catch(() => { if (current) setStatus("No se pudieron cargar las preferencias del menú."); });
        return () => { current = false; };
    }, []);

    async function save() {
        setSaving(true);
        try {
            const response = await fetch("/api/preferences/navigation-labels", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ expectedVersion: version, labels: Object.fromEntries(Object.entries(labels).filter(([, value]) => value.trim())) }),
            });
            const payload = await response.json();
            if (!response.ok) throw new ApiRequestFailure(response, response.status === 409 ? "El menú cambió en otra sesión. Recarga para continuar." : payload.error, payload);
            setVersion(payload.data.version); setLabels(payload.data.labels); setStatus("Cambios guardados.");
            window.dispatchEvent(new Event("kontave:navigation-labels-updated"));
        } catch (error) { setStatus(error instanceof Error ? error.message : "No se pudieron guardar los cambios."); }
        finally { setSaving(false); }
    }

    return <SettingsSection title="Nombres del menú" subtitle="Personaliza las etiquetas de navegación de tu cuenta; no cambia módulos, permisos ni nombres vistos por otros miembros.">
        <div className="grid gap-3 sm:grid-cols-2">
            {MODULES.map(([id, fallback]) => <label key={id} className="grid gap-1 text-sm font-medium text-foreground">
                {fallback}
                <input maxLength={60} value={labels[id] ?? ""} placeholder={fallback} onChange={(event) => setLabels((current) => ({ ...current, [id]: event.target.value }))}
                    className="h-10 rounded-lg border border-border-light bg-surface-1 px-3 font-normal outline-none focus:border-primary-500" />
            </label>)}
        </div>
        <details className="mt-4 rounded-lg border border-border-light p-3">
            <summary className="cursor-pointer text-sm font-semibold">Etiquetas de secciones</summary>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">Se aplican a la barra lateral y a las migas de pan cuando el destino está registrado.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {LABEL_GROUPS.map((group) => <fieldset key={group.id} className="grid content-start gap-2">
                    <legend className="mb-1 text-sm font-semibold">{labels[group.id] ?? group.title}</legend>
                    {group.destinations.map(([id, fallback]) => <label key={id} className="grid gap-1 text-xs font-medium text-foreground">
                        {fallback}
                        <input maxLength={60} value={labels[id] ?? ""} placeholder={fallback} onChange={(event) => setLabels((current) => ({ ...current, [id]: event.target.value }))}
                            className="h-9 rounded-lg border border-border-light bg-surface-1 px-3 text-sm font-normal outline-none focus:border-primary-500" />
                    </label>)}
                </fieldset>)}
            </div>
        </details>
        <div className="mt-4 flex items-center gap-3">
            <button type="button" disabled={saving || Boolean(status.startsWith("No se pudieron cargar"))} onClick={() => void save()} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Guardando…" : "Guardar nombres"}</button>
            <span role="status" className="text-sm text-[var(--text-tertiary)]">{status}</span>
        </div>
    </SettingsSection>;
}

/** Lets users choose portable semantic icons for registered menu destinations.
 * @returns A catalog-bound editor for modules and their secondary navigation; library-specific names are never stored.
 */
export function NavigationIconSettings() {
    const [version, setVersion] = useState(0);
    const [icons, setIcons] = useState<Record<string, string>>({});
    const [status, setStatus] = useState("Cargando iconos…");
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        let current = true;
        void fetch("/api/preferences/navigation-icons", { cache: "no-store" }).then(async (response) => {
            if (!response.ok) throw new ApiRequestFailure(response, "No se pudieron cargar los iconos.");
            return response.json();
        }).then((payload) => { if (current) { setVersion(payload.data.version); setIcons(payload.data.icons); setStatus(""); } })
            .catch(() => { if (current) setStatus("No se pudieron cargar las preferencias de iconos."); });
        return () => { current = false; };
    }, []);
    async function save() {
        setSaving(true);
        try {
            const response = await fetch("/api/preferences/navigation-icons", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: version, icons }) });
            const payload = await response.json();
            if (!response.ok) throw new ApiRequestFailure(response, response.status === 409 ? "Los iconos cambiaron en otra sesión. Recarga para continuar." : payload.error, payload);
            setVersion(payload.data.version); setIcons(payload.data.icons); setStatus("Iconos guardados.");
            window.dispatchEvent(new Event("kontave:navigation-icons-updated"));
        } catch (error) { setStatus(error instanceof Error ? error.message : "No se pudieron guardar los iconos."); }
        finally { setSaving(false); }
    }
    return <SettingsSection title="Iconos del menú" subtitle="Personaliza los iconos de módulos y secciones del menú. La preferencia es personal y no modifica permisos ni funciones.">
        <div className="grid gap-3 sm:grid-cols-2">
            {MODULES.map(([id, label]) => <label key={id} className="grid gap-1 text-sm font-medium text-foreground">{label}
                <select aria-label={`Icono de ${label}`} value={icons[id] ?? ""} onChange={(event) => setIcons((current) => { const next = { ...current }; if (event.target.value) next[id] = event.target.value; else delete next[id]; return next; })} className="h-10 rounded-lg border border-border-light bg-surface-1 px-3 font-normal">
                    <option value="">Predeterminado</option>{ICON_OPTIONS.map(([key, title]) => <option key={key} value={key}>{title}</option>)}
                </select>
            </label>)}
        </div>
        <details className="mt-4 rounded-lg border border-border-light p-3">
            <summary className="cursor-pointer text-sm font-semibold">Iconos de secciones</summary>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">Se aplican a los destinos secundarios registrados que aparecen en la barra lateral.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {LABEL_GROUPS.map((group) => <fieldset key={group.id} className="grid content-start gap-2">
                    <legend className="mb-1 text-sm font-semibold">{group.title}</legend>
                    {group.destinations.map(([id, fallback]) => <label key={id} className="grid gap-1 text-xs font-medium text-foreground">
                        {fallback}
                        <select aria-label={`Icono de ${fallback}`} value={icons[id] ?? ""} onChange={(event) => setIcons((current) => { const next = { ...current }; if (event.target.value) next[id] = event.target.value; else delete next[id]; return next; })} className="h-9 rounded-lg border border-border-light bg-surface-1 px-3 text-sm font-normal">
                            <option value="">Predeterminado</option>{ICON_OPTIONS.map(([key, title]) => <option key={key} value={key}>{title}</option>)}
                        </select>
                    </label>)}
                </fieldset>)}
            </div>
        </details>
        <div className="mt-4 flex items-center gap-3"><button type="button" disabled={saving || status.startsWith("No se pudieron cargar")} onClick={() => void save()} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Guardando…" : "Guardar iconos"}</button><span role="status" className="text-sm text-[var(--text-tertiary)]">{status}</span></div>
    </SettingsSection>;
}
