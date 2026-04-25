// Plain CSS class strings shared by every calculator's left panel.
// Use them on raw <select> / <label> elements when the page can't reach
// for BaseInput.Field (e.g. native <select> with custom chevron).

export const FIELD_CLS = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground tabular-nums appearance-none",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

export const LABEL_CLS =
    "font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 block";
