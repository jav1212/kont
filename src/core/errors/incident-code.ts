export function createIncidentCode(): string {
    const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const random = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
    return `KNT-${stamp}-${random}`;
}
