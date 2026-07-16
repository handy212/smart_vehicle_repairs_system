import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, getDjangoApiBase } from "@/lib/auth/bff-cookies";

/**
 * Issue a short-lived browser-readable access token for WebSocket auth.
 * HttpOnly cookies are not sent to the Django origin (e.g. :8001) from the
 * Next.js app origin, so WS clients need `?token=` from this endpoint.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(ACCESS_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  // Confirm the cookie is still valid before handing it to the browser for WS.
  try {
    const verify = await fetch(`${getDjangoApiBase()}/auth/token/verify/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!verify.ok) {
      return NextResponse.json({ detail: "Token expired" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ detail: "Auth service unavailable" }, { status: 503 });
  }

  return NextResponse.json(
    { token },
    {
      headers: {
        // Discourage caching of bearer material
        "Cache-Control": "no-store",
      },
    }
  );
}
