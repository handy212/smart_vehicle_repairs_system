"use client";

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi, type User } from "@/lib/api/admin";
import { workOrderTasksApi, type ServiceTask } from "@/lib/api/workorder-tasks";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";
import { CheckCircle } from "lucide-react";

export type TechnicianAssignmentPayload = {
  technician: number;
  responsibility_notes?: string;
  is_primary?: boolean;
};

export type StartDiagnosisSubmitData = {
  primary_technician?: number;
  assigned_technicians?: number[];
  technician_assignments?: TechnicianAssignmentPayload[];
  priority?: string;
  task_assignments?: Array<{ task_id: number; assigned_to: number | null }>;
};

interface StartDiagnosisFormProps {
  workOrder?: {
    id?: number;
    branch?: number | { id: number };
    primary_technician?: number | { id: number } | null;
    assigned_technicians?: Array<number | { id: number }>;
    assigned_technicians_detail?: Array<{
      id: number;
      name?: string;
      responsibility_notes?: string;
      is_primary?: boolean;
    }>;
    priority?: string;
  };
  onSubmit: (data: StartDiagnosisSubmitData) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

const getBranchId = (branch: unknown): number | undefined => {
  if (typeof branch === "number") return branch;
  if (branch && typeof branch === "object" && "id" in branch) {
    const id = (branch as { id?: unknown }).id;
    return typeof id === "number" ? id : undefined;
  }
  return undefined;
};

const techLabel = (tech: User) =>
  tech.full_name ||
  `${tech.first_name || ""} ${tech.last_name || ""}`.trim() ||
  `User ${tech.id}`;

export function StartDiagnosisForm({
  workOrder,
  onSubmit,
  onCancel,
  isSubmitting,
}: StartDiagnosisFormProps) {
  const [primaryTechnician, setPrimaryTechnician] = useState<string>(() => {
    const tech = workOrder?.primary_technician;
    if (!tech || tech === null) return "";
    if (typeof tech === "object" && "id" in tech) return String(tech.id);
    if (typeof tech === "number") return String(tech);
    return "";
  });
  const [assignedTechnicians, setAssignedTechnicians] = useState<string[]>(() => {
    const assigned = workOrder?.assigned_technicians;
    if (!Array.isArray(assigned)) return [];
    return assigned
      .map((tech) => {
        if (typeof tech === "number") return String(tech);
        if (tech && typeof tech === "object" && "id" in tech) return String(tech.id);
        return "";
      })
      .filter(Boolean);
  });
  const [responsibilityNotes, setResponsibilityNotes] = useState<Record<string, string>>(() => {
    const notes: Record<string, string> = {};
    for (const detail of workOrder?.assigned_technicians_detail || []) {
      if (detail?.id != null) {
        notes[String(detail.id)] = detail.responsibility_notes || "";
      }
    }
    return notes;
  });
  const [taskAssignees, setTaskAssignees] = useState<Record<number, string>>({});
  const [priority, setPriority] = useState(workOrder?.priority || "normal");
  const branchId = getBranchId(workOrder?.branch);
  const workOrderId = workOrder?.id;

  const { data: technicians } = useQuery({
    queryKey: ["technicians", "diagnosis-assignment", branchId],
    queryFn: () => adminApi.users.technicians(branchId ? { branch: branchId } : undefined),
  });

  const { data: tasksData } = useQuery({
    queryKey: ["workorder-tasks", workOrderId, "assign-at-diagnosis"],
    queryFn: () => workOrderTasksApi.list({ work_order: workOrderId! }),
    enabled: !!workOrderId,
  });

  const techniciansList = technicians || [];
  const openTasks = useMemo(() => {
    const results = (tasksData || []) as ServiceTask[];
    return results.filter(
      (t: ServiceTask) => t.status !== "completed" && t.status !== "skipped"
    );
  }, [tasksData]);

  const selectedTeam = useMemo(() => {
    const ids = new Set(assignedTechnicians);
    if (primaryTechnician) ids.add(primaryTechnician);
    return techniciansList.filter((t) => ids.has(String(t.id)));
  }, [assignedTechnicians, primaryTechnician, techniciansList]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const assignedIds = assignedTechnicians.map(Number).filter(Number.isFinite);
    const data: StartDiagnosisSubmitData = {};

    if (primaryTechnician && primaryTechnician !== "") {
      data.primary_technician = Number(primaryTechnician);
    }
    if (assignedIds.length > 0) {
      data.assigned_technicians = assignedIds;
      if (!data.primary_technician) {
        data.primary_technician = assignedIds[0];
      }
    }

    const teamIds =
      data.assigned_technicians?.length
        ? data.assigned_technicians
        : data.primary_technician
          ? [data.primary_technician]
          : [];

    if (teamIds.length > 0) {
      data.technician_assignments = teamIds.map((id) => ({
        technician: id,
        responsibility_notes: (responsibilityNotes[String(id)] || "").trim(),
        is_primary: data.primary_technician === id,
      }));
    }

    if (priority && priority !== workOrder?.priority) {
      data.priority = priority;
    }

    const taskUpdates = Object.entries(taskAssignees)
      .map(([taskId, techId]) => ({
        task_id: Number(taskId),
        assigned_to: techId ? Number(techId) : null,
      }))
      .filter((row) => Number.isFinite(row.task_id));
    if (taskUpdates.length > 0) {
      data.task_assignments = taskUpdates;
    }

    onSubmit(data);
  };

  const toggleAssignedTechnician = (id: string) => {
    setAssignedTechnicians((current) => {
      if (current.includes(id)) {
        const next = current.filter((value) => value !== id);
        if (primaryTechnician === id) {
          setPrimaryTechnician(next[0] || "");
        }
        return next;
      }
      if (!primaryTechnician) {
        setPrimaryTechnician(id);
      }
      return [...current, id];
    });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto px-6 pb-4">
        <div className="space-y-4">
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
            <p className="text-sm text-primary">
              <CheckCircle className="w-4 h-4 inline mr-1.5" />
              <strong>Assign to Mechanic/Technician:</strong> pick the team and note who owns what.
            </p>
          </div>

          <div>
            <Label htmlFor="primary_technician" className="block mb-2 text-foreground">
              Primary Mechanic/Technician:
            </Label>
            <select
              id="primary_technician"
              value={primaryTechnician}
              onChange={(e) => {
                const id = e.target.value;
                setPrimaryTechnician(id);
                if (id && !assignedTechnicians.includes(id)) {
                  setAssignedTechnicians((prev) => [...prev, id]);
                }
              }}
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-muted text-foreground"
            >
              <option value="">Select Mechanic/Technician</option>
              {techniciansList.map((tech: User) => (
                <option key={tech.id} value={String(tech.id)}>
                  {techLabel(tech)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label className="block mb-2 text-foreground">Assigned mechanic team</Label>
            <div className="rounded-md border border-border bg-muted p-2">
              {techniciansList.length === 0 ? (
                <p className="px-1 py-2 text-sm text-muted-foreground">
                  No active technicians are available for this work order branch.
                </p>
              ) : (
                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {techniciansList.map((tech: User) => {
                    const id = String(tech.id);
                    const checked = assignedTechnicians.includes(id);
                    return (
                      <div key={tech.id} className="rounded border border-transparent px-2 py-1.5 hover:bg-background">
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAssignedTechnician(id)}
                            className="h-4 w-4 rounded border-border"
                          />
                          <span>
                            {techLabel(tech)}
                            {primaryTechnician === id ? (
                              <span className="ml-1 text-xs text-muted-foreground">(Primary)</span>
                            ) : null}
                            {tech.branch_name ? ` — ${tech.branch_name}` : ""}
                          </span>
                        </label>
                        {checked ? (
                          <Textarea
                            className="mt-1.5 min-h-[56px] resize-none text-xs"
                            placeholder="Responsibility notes (e.g. Electrical / OBD, road test)…"
                            value={responsibilityNotes[id] || ""}
                            onChange={(e) =>
                              setResponsibilityNotes((prev) => ({
                                ...prev,
                                [id]: e.target.value,
                              }))
                            }
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {openTasks.length > 0 && selectedTeam.length > 0 ? (
            <div>
              <Label className="block mb-2 text-foreground">Assign existing tasks (optional)</Label>
              <p className="mb-2 text-xs text-muted-foreground">
                Map open tasks to a team member so everyone knows who is doing what.
              </p>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border bg-muted p-2">
                {openTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex flex-col gap-1 rounded border border-border/60 bg-background px-2 py-1.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{task.description || task.task_type}</p>
                      <p className="text-[11px] text-muted-foreground capitalize">
                        {task.task_type?.replace(/_/g, " ")}
                        {task.assigned_to_name ? ` · currently ${task.assigned_to_name}` : ""}
                      </p>
                    </div>
                    <select
                      className="w-full rounded-md border border-border bg-muted px-2 py-1.5 text-xs sm:w-44"
                      value={
                        taskAssignees[task.id] ??
                        (typeof task.assigned_to === "object" && task.assigned_to
                          ? String(task.assigned_to.id)
                          : typeof task.assigned_to === "number"
                            ? String(task.assigned_to)
                            : "")
                      }
                      onChange={(e) =>
                        setTaskAssignees((prev) => ({
                          ...prev,
                          [task.id]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Unassigned</option>
                      {selectedTeam.map((tech) => (
                        <option key={tech.id} value={String(tech.id)}>
                          {techLabel(tech)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <Label htmlFor="priority" className="block mb-2 text-foreground">
              Priority (Optional)
            </Label>
            <select
              id="priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-muted text-foreground"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>
      </div>
      <DialogFooter className="shrink-0 px-6 pb-6 pt-4 border-t border-border/50">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? "Starting..." : "Start Diagnosis"}
        </Button>
      </DialogFooter>
    </div>
  );
}
