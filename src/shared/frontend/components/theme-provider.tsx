"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
    theme:       Theme;
    toggleTheme: () => void;
    setTheme:    (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
    theme:       "dark",
    toggleTheme: () => {},
    setTheme:    () => {},
});

export function useTheme() {
    return useContext(ThemeContext);
}

function applyTheme(t: Theme) {
    const html = document.documentElement;
    if (t === "dark") html.classList.add("dark");
    else              html.classList.remove("dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<Theme>("dark");

    useEffect(() => {
        const stored = localStorage.getItem("kont-theme") as Theme | null;
        const system = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        const initial = stored ?? system;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only init (localStorage/matchMedia); runs once on mount
        setTheme(initial);
        applyTheme(initial);
    }, []);

    function toggleTheme() {
        const next = theme === "dark" ? "light" : "dark";
        setThemeState(next);
        localStorage.setItem("kont-theme", next);
        applyTheme(next);
    }

    function setTheme(t: Theme) {
        setThemeState(t);
        localStorage.setItem("kont-theme", t);
        applyTheme(t);
    }

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}
