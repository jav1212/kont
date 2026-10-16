"use client";

import { useEffect, useId, useState } from "react";
import type { SystemLabelDefinition } from "@kontave/preferences/application";
import { Loader2, RotateCcw, Tags } from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { notify } from "@/src/shared/frontend/notify";

/** Configuration needed to edit one server-registered user label catalog. */
export interface SystemLabelSettingsProps {
  /** Canonical labels registered by the owning capability. */
  readonly catalog: readonly SystemLabelDefinition[];
  /** Same-origin API route bound to this catalog on the server. */
  readonly endpoint: string;
  /** Dialog title shown to the user. */
  readonly title: string;
  /** Explains which presentation this catalog changes. */
  readonly description: string;
  /** Publishes effective labels to the consuming screen. */
  readonly onLabelsChange: (labels: Readonly<Record<string, string>>) => void;
}

/** Loads and updates user-scoped label overrides for one registered catalog.
 * @param props - Catalog, server endpoint, copy and consumer state callback.
 * @returns A control that opens the revisioned label editor.
 * @throws No expected request failures escape; they are reported inline and through notifications.
 */
export function SystemLabelSettings({ catalog, endpoint, title, description, onLabelsChange }: SystemLabelSettingsProps): React.JSX.Element {
  const dialogId = useId();
  const [open, setOpen] = useState(false);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    void fetch(endpoint, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error ?? "No fue posible cargar las etiquetas.");
        if (!current) return;
        const resolved = payload.data.labels as Record<string, string>;
        setLabels(resolved);
        setDraft(resolved);
        setVersion(payload.data.version as number);
        onLabelsChange(resolved);
      })
      .catch((cause: unknown) => {
        if (current) setError(cause instanceof Error ? cause.message : "No fue posible cargar las etiquetas.");
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [endpoint, onLabelsChange, refreshToken]);

  async function save(nextLabels: Readonly<Record<string, string>>) {
    if (version === null || saving) return;
    setSaving(true);
    setError(null);
    const overrides = Object.fromEntries(catalog.flatMap(({ id, defaultLabel, customizable }) =>
      !customizable || nextLabels[id] === defaultLabel ? [] : [[id, nextLabels[id] ?? defaultLabel]],
    ));
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: version, labels: overrides }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "No fue posible guardar las etiquetas.");
      const resolved = payload.data.labels as Record<string, string>;
      setLabels(resolved);
      setDraft(resolved);
      setVersion(payload.data.version as number);
      onLabelsChange(resolved);
      notify.success("Etiquetas guardadas.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "No fue posible guardar las etiquetas.";
      setError(message);
      notify.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <BaseButton.Root variant="secondary" size="sm" leftIcon={<Tags size={14} />} onClick={() => {
        setRefreshToken((token) => token + 1);
        setOpen(true);
      }}>
        Etiquetas
      </BaseButton.Root>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) setOpen(false);
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby={dialogId} className="w-full max-w-lg rounded-xl border border-border-light bg-surface-1 p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id={dialogId} className="font-semibold text-foreground">{title}</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
              </div>
              <button type="button" className="text-sm text-[var(--text-secondary)]" onClick={() => setOpen(false)} disabled={saving}>Cerrar</button>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-[var(--text-secondary)]"><Loader2 size={16} className="animate-spin" /> Cargando…</div>
            ) : (
              <div className="space-y-3">
                {catalog.filter(({ customizable }) => customizable).map(({ id, defaultLabel }) => (
                  <label key={id} className="block text-sm font-medium text-foreground">
                    {defaultLabel}
                    <input
                      value={draft[id] ?? defaultLabel}
                      maxLength={60}
                      onChange={(event) => setDraft((current) => ({ ...current, [id]: event.target.value }))}
                      className="mt-1 h-10 w-full rounded-lg border border-border-default bg-surface-1 px-3 font-normal outline-none focus:border-primary-500"
                    />
                  </label>
                ))}
                {error && <p role="alert" className="text-sm text-text-error">{error}</p>}
              </div>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <BaseButton.Root variant="secondary" size="sm" leftIcon={<RotateCcw size={14} />} onClick={() => void save(Object.fromEntries(catalog.map(({ id, defaultLabel }) => [id, defaultLabel])))} isDisabled={loading || saving || version === null || catalog.every(({ id, defaultLabel, customizable }) => !customizable || labels[id] === defaultLabel)}>
                Restaurar
              </BaseButton.Root>
              <BaseButton.Root variant="primary" size="sm" onClick={() => void save(draft)} loading={saving} isDisabled={loading || saving || version === null}>
                Guardar etiquetas
              </BaseButton.Root>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
