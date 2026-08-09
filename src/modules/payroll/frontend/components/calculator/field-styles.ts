// Plain CSS class strings shared by every calculator's left panel.
// Use them on raw <select> / <label> elements when the page can't reach
// for BaseInput.Field (e.g. native <select> with custom chevron).

export const FIELD_CLS = [
    "control-select control-select-sm appearance-none",
    "w-full text-foreground tabular-nums",
].join(" ");

export const LABEL_CLS =
    "font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 block";
