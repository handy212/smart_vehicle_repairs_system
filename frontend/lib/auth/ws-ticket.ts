/**
 * Fetch a one-shot JWT for Django WebSocket auth.
 * Needed because HttpOnly access cookies live on the Next origin and are not
 * visible to JS / not sent to ws://backend:8001.
 */
export async function fetchWsTicket(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/ws-ticket", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { token?: string };
    return data.token || null;
  } catch {
    return null;
  }
}
