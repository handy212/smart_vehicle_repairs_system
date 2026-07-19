import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateRangePicker } from "@/components/ui/date-range-picker";

describe("DateRangePicker", () => {
  it("associates labels and IDs and uses a responsive mobile-first layout", () => {
    render(
      <DateRangePicker
        idPrefix="service-window"
        startDate="2026-07-01"
        endDate="2026-07-31"
        onStartDateChange={vi.fn()}
        onEndDateChange={vi.fn()}
      />
    );

    const start = screen.getByLabelText("Start date");
    const end = screen.getByLabelText("End date");
    expect(start).toHaveAttribute("id", "service-window-start");
    expect(start).toHaveAttribute("max", "2026-07-31");
    expect(end).toHaveAttribute("id", "service-window-end");
    expect(end).toHaveAttribute("min", "2026-07-01");
    expect(start.closest(".flex.flex-col")).toHaveClass("sm:flex-row");
  });

  it("rejects an end date before the start date", () => {
    const onEndDateChange = vi.fn();
    render(
      <DateRangePicker
        startDate="2026-07-10"
        endDate=""
        onStartDateChange={vi.fn()}
        onEndDateChange={onEndDateChange}
      />
    );

    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-07-09" } });

    expect(onEndDateChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "End date must be on or after start date."
    );
    expect(screen.getByLabelText("End date")).toHaveAttribute("aria-invalid", "true");
  });

  it("rejects a start date after the end date and accepts valid changes", () => {
    const onStartDateChange = vi.fn();
    render(
      <DateRangePicker
        startDate=""
        endDate="2026-07-10"
        onStartDateChange={onStartDateChange}
        onEndDateChange={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-07-11" } });
    expect(onStartDateChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Start date must be on or before end date."
    );

    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-07-01" } });
    expect(onStartDateChange).toHaveBeenCalledWith("2026-07-01");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
