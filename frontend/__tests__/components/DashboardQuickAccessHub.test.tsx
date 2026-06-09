import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DashboardQuickAccessHub } from "@/app/(dashboard)/dashboard/components/DashboardQuickAccessHub";

vi.mock("@/lib/hooks/usePermissions", () => ({
  usePermissions: vi.fn(),
}));

vi.mock("@/lib/hooks/useModules", () => ({
  useModules: vi.fn(),
}));

import { usePermissions } from "@/lib/hooks/usePermissions";
import { useModules } from "@/lib/hooks/useModules";
import type { Mock } from "vitest";

describe("DashboardQuickAccessHub", () => {
  beforeEach(() => {
    (usePermissions as Mock).mockReturnValue({
      hasPermission: (permission: string) =>
        [
          "view_customers",
          "view_billing",
          "create_invoices",
          "view_reports",
          "view_accounting",
          "view_bank_statements",
          "view_financial_reports",
          "edit_assets",
        ].includes(permission),
    });

    (useModules as Mock).mockReturnValue({
      isModuleEnabled: () => true,
    });
  });

  it("renders live links from the hub for existing workflows", () => {
    render(<DashboardQuickAccessHub />);

    const customerCentre = screen.getByRole("link", { name: /customer centre/i });
    expect(customerCentre).toHaveAttribute("href", "/customers");

    expect(screen.getByRole("link", { name: /customer statements/i })).toHaveAttribute(
      "href",
      "/customers/statements"
    );
    expect(screen.getByRole("link", { name: /vendor credits/i })).toHaveAttribute(
      "href",
      "/billing/vendor-credits"
    );
  });

  it("hides items the user does not have permission to access", () => {
    (usePermissions as Mock).mockReturnValue({
      hasPermission: (permission: string) => ["view_customers", "view_billing"].includes(permission),
    });

    render(<DashboardQuickAccessHub />);

    expect(screen.queryByRole("link", { name: /create invoices/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /customer centre/i })).toBeInTheDocument();
  });

  it("hides groups when every item is removed by module gating", () => {
    (usePermissions as Mock).mockReturnValue({
      hasPermission: (permission: string) =>
        ["view_financial_reports", "view_bank_statements"].includes(permission),
    });
    (useModules as Mock).mockReturnValue({
      isModuleEnabled: (module: string) => module !== "accounting",
    });

    render(<DashboardQuickAccessHub />);

    expect(screen.queryByTestId("quick-access-group-tax-management")).not.toBeInTheDocument();
  });

  it("supports expanding a collapsed group to reveal its links", () => {
    render(<DashboardQuickAccessHub />);

    expect(screen.queryByTestId("quick-access-item-transfer-funds")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /banking & cash management/i }));

    expect(screen.getByRole("link", { name: /transfer funds/i })).toHaveAttribute(
      "href",
      "/accounting/transfers"
    );
  });
});
