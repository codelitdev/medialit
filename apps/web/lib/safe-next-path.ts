/**
 * Where to go after signing in: the path, query and hash of `next` when it
 * stays on `origin`, or home. `next` is resolved as a URL before checking,
 * because browsers drop tabs and newlines, so `/\t/evil.com` is `//evil.com`.
 */
export function safeNextPath(next: string | null, origin: string): string {
    if (!next?.startsWith("/")) return "/";
    try {
        const url = new URL(next, origin);
        return url.origin === origin
            ? url.pathname + url.search + url.hash
            : "/";
    } catch {
        return "/";
    }
}
