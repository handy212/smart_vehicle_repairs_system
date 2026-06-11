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
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
          "view_accounting",
          "view_bank_statements",
          "view_financial_reports",
=======
=======
>>>>>>> theirs
=======
>>>>>>> theirs
          "view_inventory",
          "view_accounting",
          "view_bank_statements",
          "view_financial_reports",
          "create_purchase_orders",
<<<<<<< ours
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
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

<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
=======
=======
>>>>>>> theirs
=======
>>>>>>> theirs
  it("labels partial shortcuts without disabling their closest safe destination", () => {
    render(<DashboardQuickAccessHub />);

    const salesOrders = screen.getByRole("link", { name: /sales orders/i });
    expect(salesOrders).toHaveAttribute("href", "/billing/proformas");
    expect(salesOrders).toHaveTextContent(/partial/i);
  });

  it("keeps planned workflows visible but disabled", () => {
    render(<DashboardQuickAccessHub />);

    fireEvent.click(screen.getByRole("button", { name: /banking & cash management/i }));

    const cashExpense = screen.getByTestId("quick-access-item-pay-cash-expense");
    expect(cashExpense).toHaveAttribute("aria-disabled", "true");
    expect(cashExpense).toHaveTextContent(/coming soon/i);
    expect(screen.queryByRole("link", { name: /pay cash expense/i })).not.toBeInTheDocument();
  });

<<<<<<< ours
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
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
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
=======
=======
>>>>>>> theirs
=======
>>>>>>> theirs

  it("filters shortcuts by search text", () => {
    render(<DashboardQuickAccessHub />);

    fireEvent.change(screen.getByPlaceholderText(/search shortcuts/i), {
      target: { value: "withholding" },
    });
    fireEvent.click(screen.getByRole("button", { name: /tax management/i }));

    expect(screen.getByTestId("quick-access-item-withholding-tax")).toHaveTextContent(/coming soon/i);
    expect(screen.queryByRole("link", { name: /customer centre/i })).not.toBeInTheDocument();
  });
<<<<<<< ours
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
});
