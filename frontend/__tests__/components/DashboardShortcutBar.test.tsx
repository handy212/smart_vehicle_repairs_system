import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { DashboardShortcutBar } from "@/app/(dashboard)/dashboard/components/DashboardShortcutBar";

vi.mock("@/lib/hooks/usePermissions", () => ({
  usePermissions: vi.fn(),
}));

vi.mock("@/lib/hooks/useModules", () => ({
  useModules: vi.fn(),
}));

import { usePermissions } from "@/lib/hooks/usePermissions";
import { useModules } from "@/lib/hooks/useModules";

describe("DashboardShortcutBar", () => {
  beforeEach(() => {
    localStorage.clear();
    (usePermissions as Mock).mockReturnValue({
      hasPermission: () => true,
      hasAnyPermission: () => true,
    });
    (useModules as Mock).mockReturnValue({
      isModuleEnabled: () => true,
      canViewModuleManagement: false,
    });
  });

  it("renders quick access with grouped navigation collapsed by default", async () => {
    const user = userEvent.setup();
    render(<DashboardShortcutBar />);

    expect(screen.getByRole("heading", { name: /quick access/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /customers & sales/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /financial overview/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /sales summary/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /financial overview/i }));
    expect(screen.getByRole("link", { name: /sales summary/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /customers & sales/i }));

    expect(screen.getByRole("link", { name: /create invoices/i })).toHaveAttribute(
      "href",
      "/billing/invoices/new"
    );
    expect(screen.getByRole("link", { name: /receive payments/i })).toHaveAttribute(
      "href",
      "/billing/payments"
    );
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it("hides links blocked by permissions", async () => {
    const user = userEvent.setup();
    (usePermissions as Mock).mockReturnValue({
      hasPermission: (permission: string) => permission !== "create_invoices",
      hasAnyPermission: () => true,
    });

    render(<DashboardShortcutBar />);

    await user.click(screen.getByRole("button", { name: /customers & sales/i }));

    expect(screen.queryByRole("link", { name: /create invoices/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /customer centre/i })).toBeInTheDocument();
  });

  it("can hide quick access from the dashboard", async () => {
    const user = userEvent.setup();
    render(<DashboardShortcutBar />);

    await user.click(screen.getByRole("button", { name: /hide quick access/i }));

    expect(screen.queryByRole("heading", { name: /quick access/i })).not.toBeInTheDocument();
    expect(localStorage.getItem("dashboardQuickAccessHidden")).toBe("true");
  });
});
