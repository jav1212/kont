const DEFAULT_TIME_ZONE = "America/Caracas";

export function formatIsoDateInTimeZone(
    date: Date = new Date(),
    timeZone: string = DEFAULT_TIME_ZONE,
): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);

    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;

    if (!year || !month || !day) {
        throw new Error("No se pudo formatear la fecha local.");
    }

    return `${year}-${month}-${day}`;
}

export function getTodayIsoDate(timeZone?: string): string {
    return formatIsoDateInTimeZone(new Date(), timeZone);
}
