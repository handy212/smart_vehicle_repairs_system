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
    (usePermissions as Mock).mockReturnValue({
      hasPermission: () => true,
      hasAnyPermission: () => true,
    });
    (useModules as Mock).mockReturnValue({
      isModuleEnabled: () => true,
      canViewModuleManagement: false,
    });
  });

  it("renders dashboard requirements with grouped navigation", async () => {
    const user = userEvent.setup();
    render(<DashboardShortcutBar />);

    expect(screen.getByRole("heading", { name: /dashboard requirements/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /customers & sales/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /financial overview/i })).toBeInTheDocument();

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
});
