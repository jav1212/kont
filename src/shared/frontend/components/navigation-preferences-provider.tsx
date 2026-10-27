"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type NavigationPreferences = { readonly labels: Readonly<Record<string, string>>; readonly icons: Readonly<Record<string, string>>; readonly ready: boolean };
const NavigationPreferencesContext = createContext<NavigationPreferences>({ labels: {}, icons: {}, ready: false });

/**
 * Loads navigation preferences once for the authenticated application shell.
 * @param props - Application subtree that consumes the shared preference state.
 * @returns A provider for navigation labels and icon overrides.
 */
export function NavigationPreferencesProvider({ children }: { readonly children: React.ReactNode }) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async (kind: "labels" | "icons") => {
      try {
        const response = await fetch(`/api/preferences/navigation-${kind}`, { cache: "no-store" });
        const payload = response.ok ? await response.json() : null;
        if (!active) return;
        if (kind === "labels" && payload?.data?.labels) setLabels(payload.data.labels);
        if (kind === "icons" && payload?.data?.icons) setIcons(payload.data.icons);
      } catch { /* Preferences are optional; catalog defaults remain available. */ }
    };
    const reloadLabels = () => void load("labels");
    const reloadIcons = () => void load("icons");
    void Promise.all([load("labels"), load("icons")]).finally(() => { if (active) setReady(true); });
    window.addEventListener("kontave:navigation-labels-updated", reloadLabels);
    window.addEventListener("kontave:navigation-icons-updated", reloadIcons);
    return () => {
      active = false;
      window.removeEventListener("kontave:navigation-labels-updated", reloadLabels);
      window.removeEventListener("kontave:navigation-icons-updated", reloadIcons);
    };
  }, []);
  const value = useMemo(() => ({ labels, icons, ready }), [icons, labels, ready]);
  return <NavigationPreferencesContext.Provider value={value}>{children}</NavigationPreferencesContext.Provider>;
}

/**
 * Returns the shared labels, icon overrides, and initial loading status for app chrome.
 * @returns The current shared navigation preferences.
 */
export function useNavigationPreferences(): NavigationPreferences {
  return useContext(NavigationPreferencesContext);
}
