import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { SESSION_PRESENCE_COOKIE } from "@/lib/auth/bff-cookies";

function protectedRequest(cookie?: string) {
  return new NextRequest("http://localhost:3000/dashboard", {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("protected-route session continuity", () => {
  it("allows the client shell to refresh a marked session", () => {
    const response = proxy(
      protectedRequest(`${SESSION_PRESENCE_COOKIE}=1`),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects when neither access nor refreshable-session state exists", () => {
    const response = proxy(protectedRequest());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fdashboard",
    );
  });
});
