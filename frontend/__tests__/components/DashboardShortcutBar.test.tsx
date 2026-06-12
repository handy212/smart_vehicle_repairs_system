import { render, screen } from "@testing-library/react";
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
    });
    (useModules as Mock).mockReturnValue({
      isModuleEnabled: () => true,
    });
  });

  it("renders a compact set of primary shortcuts", () => {
    render(<DashboardShortcutBar />);

    expect(screen.getByRole("heading", { name: /quick shortcuts/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create invoice/i })).toHaveAttribute("href", "/billing/invoices/new");
    expect(screen.getByRole("link", { name: /receive payment/i })).toHaveAttribute("href", "/billing/payments");
    expect(screen.getByRole("link", { name: /financial reports/i })).toHaveAttribute("href", "/accounting/reports");
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it("hides shortcuts blocked by permissions", () => {
    (usePermissions as Mock).mockReturnValue({
      hasPermission: (permission: string) => permission !== "create_invoices",
    });

    render(<DashboardShortcutBar />);

    expect(screen.queryByRole("link", { name: /create invoice/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /customers/i })).toBeInTheDocument();
  });
});
