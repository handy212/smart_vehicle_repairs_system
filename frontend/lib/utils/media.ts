/**
 * Turn an absolute media URL from the API into a same-origin path so Next.js
 * `/media/*` rewrites proxy to the backend. Leaves non-/media URLs unchanged
 * (e.g. external object storage).
 */
export function sameOriginMediaPath(fileUrl: string | null | undefined): string | undefined {
    if (!fileUrl) return undefined;

    try {
        const u = new URL(fileUrl);
        if (u.pathname.startsWith("/media/")) {
            return `${u.pathname}${u.search}`;
        }
        // Backend host may differ (127.0.0.1:8001, localhost:8000) — still proxy via Next
        const mediaIdx = u.pathname.indexOf("/media/");
        if (mediaIdx >= 0) {
            return `${u.pathname.slice(mediaIdx)}${u.search}`;
        }
    } catch {
        if (fileUrl.startsWith("/media/")) {
            return fileUrl;
        }
    }

    return undefined;
}
