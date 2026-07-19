import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  AdvancedFilters,
  countActiveFilters,
  type FilterOption,
} from "@/components/ui/advanced-filters";

const filters: FilterOption[] = [
  { key: "query", label: "Search", type: "text" },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: [
      { value: "open", label: "Open jobs" },
      { value: "closed", label: "Closed jobs" },
    ],
  },
  { key: "created", label: "Created", type: "daterange" },
];

describe("AdvancedFilters", () => {
  it("counts a logical date range once and renders partial ranges and select labels", async () => {
    const user = userEvent.setup();
    render(
      <AdvancedFilters
        filters={filters}
        activeFilters={{
          status: "open",
          created_from: "2026-07-01",
          empty: "",
          ignored: null,
        }}
        onFiltersChange={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(countActiveFilters({ created_from: "2026-07-01", created_to: "2026-07-31" }, filters)).toBe(1);
    expect(screen.getByText("2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^filters/i }));

    expect(
      screen.getByRole("button", { name: "Remove Status filter" }).parentElement
    ).toHaveTextContent("Status:Open jobs");
    expect(screen.getByText("From 2026-07-01")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Created filter" })).toBeInTheDocument();
  });

  it("normalizes Apply and Reset restores the committed transaction", async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    render(
      <AdvancedFilters
        filters={filters}
        activeFilters={{ status: "open" }}
        onFiltersChange={onFiltersChange}
        onClear={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /^filters/i }));
    await user.clear(screen.getByLabelText("Search"));
    await user.type(screen.getByLabelText("Search"), "draft");
    await user.selectOptions(screen.getByLabelText("Status"), "");
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByLabelText("Search")).toHaveValue("");
    expect(screen.getByLabelText("Status")).toHaveValue("open");

    await user.selectOptions(screen.getByLabelText("Status"), "");
    await user.click(screen.getByRole("button", { name: "Apply Filters" }));
    expect(onFiltersChange).toHaveBeenLastCalledWith({});
  });

  it("removes a committed chip without committing unrelated draft edits", async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    render(
      <AdvancedFilters
        filters={filters}
        activeFilters={{ status: "open", created_to: "2026-07-31" }}
        onFiltersChange={onFiltersChange}
        onClear={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /^filters/i }));
    await user.type(screen.getByLabelText("Search"), "uncommitted");
    expect(screen.getByText("Until 2026-07-31")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Status filter" }));

    expect(onFiltersChange).toHaveBeenLastCalledWith({ created_to: "2026-07-31" });
    expect(screen.getByLabelText("Search")).toHaveValue("uncommitted");
  });

  it("clears through the clear contract without applying the draft", async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    const onClear = vi.fn();
    render(
      <AdvancedFilters
        filters={filters}
        activeFilters={{ status: "open" }}
        onFiltersChange={onFiltersChange}
        onClear={onClear}
      />
    );

    await user.click(screen.getByRole("button", { name: /^filters/i }));
    await user.type(screen.getByLabelText("Search"), "uncommitted");
    await user.click(screen.getByRole("button", { name: "Clear All" }));

    expect(onClear).toHaveBeenCalledOnce();
    expect(onFiltersChange).not.toHaveBeenCalled();
    expect(screen.queryByText("Advanced Filters")).not.toBeInTheDocument();
  });

  it("documents quick presets as replacements and exposes selected state", async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    const { rerender } = render(
      <AdvancedFilters
        filters={filters}
        quickFilters={[{ label: "Open only", value: "open", filters: { status: "open", query: "" } }]}
        activeFilters={{ status: "open" }}
        onFiltersChange={onFiltersChange}
        onClear={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /^filters/i }));
    expect(screen.getByText("Choosing a preset replaces all current filters.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open only" })).toHaveAttribute("aria-pressed", "true");

    rerender(
      <AdvancedFilters
        filters={filters}
        quickFilters={[{ label: "Open only", value: "open", filters: { status: "open", query: "" } }]}
        activeFilters={{ status: "closed", query: "existing" }}
        onFiltersChange={onFiltersChange}
        onClear={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Open only" }));
    expect(onFiltersChange).toHaveBeenLastCalledWith({ status: "open" });
  });
});
