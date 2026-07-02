import { describe, it, expect } from "vitest";
import {
  getWorkflowProfileCode,
  getWorkflowStepIndexForWorkOrder,
  getWorkflowStepsForWorkOrder,
  isDiagnosticOnlyWorkOrder,
  isInspectionOnlyWorkOrder,
  isRoutineMaintenanceWorkOrder,
} from "@/lib/utils/workorder-workflow-steps";
import { getWorkOrderProfile, workOrderSkipsRepairs } from "@/lib/workorders/work-order-profile";

const inspectionOnlyWorkOrder = {
  workflow_profile_code: "inspection_only",
  job_type_detail: { workflow_profile: { code: "inspection_only" } },
};

const diagnosticOnlyWorkOrder = {
  workflow_profile_code: "diagnostic_only",
  job_type_detail: { workflow_profile: { code: "diagnostic_only" } },
};

const routineWorkOrder = {
  workflow_profile_code: "routine_fast_track",
  maintenance_type: "routine",
};

describe("workorder-workflow-steps", () => {
  it("resolves profile code from workflow_profile_code", () => {
    expect(getWorkflowProfileCode(inspectionOnlyWorkOrder)).toBe("inspection_only");
  });

  it("uses shortened steps for inspection_only", () => {
    const steps = getWorkflowStepsForWorkOrder(inspectionOnlyWorkOrder);
    expect(steps.map((s) => s.key)).toEqual([
      "draft",
      "inspection",
      "completed",
      "invoiced",
      "closed",
    ]);
  });

  it("allows inspection → completed index for inspection_only", () => {
    const index = getWorkflowStepIndexForWorkOrder("completed", {
      ...inspectionOnlyWorkOrder,
      status: "completed",
    });
    expect(index).toBe(2);
  });

  it("detects routine fast track", () => {
    expect(isRoutineMaintenanceWorkOrder(routineWorkOrder)).toBe(true);
    expect(isInspectionOnlyWorkOrder(routineWorkOrder)).toBe(false);
  });

  it("detects diagnostic_only profile", () => {
    expect(isDiagnosticOnlyWorkOrder(diagnosticOnlyWorkOrder)).toBe(true);
    const steps = getWorkflowStepsForWorkOrder(diagnosticOnlyWorkOrder);
    expect(steps.some((s) => s.key === "awaiting_approval")).toBe(true);
    expect(steps.some((s) => s.key === "in_progress")).toBe(false);
  });
});

describe("work-order-profile", () => {
  it("flags repair-skipping profiles", () => {
    expect(workOrderSkipsRepairs(inspectionOnlyWorkOrder)).toBe(true);
    expect(workOrderSkipsRepairs(diagnosticOnlyWorkOrder)).toBe(true);
    expect(workOrderSkipsRepairs(routineWorkOrder)).toBe(false);
  });

  it("exposes profile context helpers", () => {
    const profile = getWorkOrderProfile(diagnosticOnlyWorkOrder);
    expect(profile.isDiagnosticOnly).toBe(true);
    expect(profile.allowsSimplifiedCompletion).toBe(true);
  });
});
