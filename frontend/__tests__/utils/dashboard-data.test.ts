import { describe, expect, it } from "vitest";
import {
  buildStatusCountsFromDashboardStats,
  buildSummaryFromDashboardStats,
  mapWorkOrderToDashboardRecent,
} from "@/lib/utils/dashboard-data";

describe("dashboard-data helpers", () => {
  it("builds work-order summary from dashboard stats fallback", () => {
    expect(
      buildSummaryFromDashboardStats({
        total_workorders: 12,
        pending: 3,
        in_progress: 4,
        completed: 5,
      })
    ).toEqual({
      total_work_orders: 12,
      pending_count: 3,
      active_count: 4,
      completed: 5,
    });
  });

  it("builds status counts from dashboard stats fallback", () => {
    expect(
      buildStatusCountsFromDashboardStats({
        pending: 2,
        in_progress: 1,
        completed: 0,
        cancelled: 0,
      })
    ).toEqual([
      { status: "pending", count: 2, label: "Pending" },
      { status: "in_progress", count: 1, label: "In Progress" },
    ]);
  });

  it("maps work-order list rows for the dashboard table", () => {
    const mapped = mapWorkOrderToDashboardRecent({
      id: 9,
      work_order_number: "WO-0009",
      customer: 1,
      vehicle: 2,
      status: "in_progress",
      priority: "normal",
      created_at: "2026-06-14T10:00:00Z",
      customer_name: "Jane Doe",
      vehicle_display: "2020 Toyota Camry",
      diagnosis_status: "in_progress",
    });

    expect(mapped.wo_number).toBe("WO-0009");
    expect(mapped.customer).toBe("Jane Doe");
    expect(mapped.vehicle).toBe("2020 Toyota Camry");
  });
});
