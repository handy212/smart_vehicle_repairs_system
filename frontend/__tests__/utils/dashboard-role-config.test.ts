import { describe, expect, it } from "vitest";
import { getDashboardRoleConfig, dashboardShowsSection } from "@/lib/utils/dashboard-role-config";
import { getPostLoginPath } from "@/lib/utils/post-login-redirect";

describe("getDashboardRoleConfig", () => {
  it("maps receptionist to front desk variant with check-in", () => {
    const config = getDashboardRoleConfig("receptionist");
    expect(config.variant).toBe("receptionist");
    expect(config.showCheckIn).toBe(true);
    expect(config.defaultWoFilter).toBe("pending");
    expect(dashboardShowsSection(config, "appointments")).toBe(true);
    expect(dashboardShowsSection(config, "technician_perf")).toBe(false);
  });

  it("maps accountant to billing-focused variant", () => {
    const config = getDashboardRoleConfig("accountant");
    expect(config.variant).toBe("accountant");
    expect(config.defaultMainTab).toBe("invoices");
    expect(dashboardShowsSection(config, "bottom_summary")).toBe(true);
    expect(dashboardShowsSection(config, "appointments")).toBe(false);
  });

  it("maps technician to workshop-focused dashboard", () => {
    const config = getDashboardRoleConfig("technician");
    expect(config.variant).toBe("technician");
    expect(config.title).toBe("My Workshop");
    expect(config.defaultWoFilter).toBe("active");
    expect(dashboardShowsSection(config, "appointments")).toBe(true);
    expect(dashboardShowsSection(config, "technician_perf")).toBe(false);
    expect(dashboardShowsSection(config, "low_stock")).toBe(false);
    expect(dashboardShowsSection(config, "service_due")).toBe(false);
    expect(dashboardShowsSection(config, "bottom_summary")).toBe(false);
  });

  it("maps technician login path via post-login redirect utility contract", () => {
    expect(getPostLoginPath("technician", { useMobileApp: false })).toBe("/dashboard");
    expect(getPostLoginPath("technician", { useMobileApp: true })).toBe("/mobile/dashboard");
  });
});
