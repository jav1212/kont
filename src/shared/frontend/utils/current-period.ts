// Shared helper that returns the current period string in YYYY-MM format.
// Used across module dashboards to label the active operational period.
export function currentPeriod(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
