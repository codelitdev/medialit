/**
 * Matches a file against an `<input accept>` value. Browsers apply `accept`
 * to the file picker but not to dropped files.
 */
export function matchesAccept(
    file: { name: string; type: string },
    accept?: string,
): boolean {
    const rules = (accept || "")
        .split(",")
        .map((rule) => rule.trim().toLowerCase())
        .filter(Boolean);
    if (!rules.length) return true;

    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    return rules.some((rule) => {
        if (rule.startsWith(".")) return name.endsWith(rule);
        if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
        return type === rule;
    });
}

export function formatBytes(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    const rounded =
        value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1);
    return `${rounded} ${units[unit]}`;
}
