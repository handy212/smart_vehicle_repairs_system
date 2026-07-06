import { describe, expect, it } from "vitest";
import { getPostLoginPath, isMobileShellRole } from "@/lib/utils/post-login-redirect";

describe("getPostLoginPath", () => {
  it("sends customers to the portal", () => {
    expect(getPostLoginPath("customer")).toBe("/portal");
  });

  it("sends technicians to desktop dashboard on wide viewports", () => {
    expect(getPostLoginPath("technician", { useMobileApp: false })).toBe("/dashboard");
  });

  it("sends technicians to mobile dashboard on narrow viewports", () => {
    expect(getPostLoginPath("technician", { useMobileApp: true })).toBe("/mobile/dashboard");
  });

  it("sends service coordinators to the staff dashboard", () => {
    expect(getPostLoginPath("service_coordinator", { useMobileApp: true })).toBe("/dashboard");
    expect(getPostLoginPath("service_coordinator", { useMobileApp: false })).toBe("/dashboard");
  });

  it("defaults other staff roles to dashboard", () => {
    expect(getPostLoginPath("manager")).toBe("/dashboard");
    expect(getPostLoginPath("receptionist")).toBe("/dashboard");
  });
});

describe("isMobileShellRole", () => {
  it("only treats technicians as mobile-shell roles", () => {
    expect(isMobileShellRole("technician")).toBe(true);
    expect(isMobileShellRole("service_coordinator")).toBe(false);
    expect(isMobileShellRole("manager")).toBe(false);
  });
});
