"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { Clock } from "lucide-react";
import { WorkOrder } from "@/lib/api/workorders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isRoutineMaintenanceWorkOrder } from "@/lib/utils/workorder-workflow-steps";

interface TimelineProps {
  workOrder: WorkOrder;
  notes: Array<{
    id?: number | string;
    created_at?: string;
    note?: string;
    text?: string;
    content?: string;
    note_type?: string;
    is_important?: boolean;
    created_by_name?: string;
    author_name?: string;
  }>;
}

type TimelineEvent = {
  id: string;
  timestamp: string;
  category: string;
  title: string;
  detail?: string;
  actor?: string;
  variant?: BadgeProps["variant"];
};

const formatDate = (timestamp: string) => {
  const isMidnightStamp = /T00:00:00(?:\.000)?(?:Z|[+-]\d{2}:\d{2})?$/.test(timestamp);
  return {
    date: format(new Date(timestamp), "MMM d, yyyy"),
    time: isMidnightStamp ? "" : format(new Date(timestamp), "h:mm a"),
  };
};

const createdByName = (createdBy: WorkOrder["created_by"]) => {
  if (createdBy && typeof createdBy === "object") {
    return `${createdBy.first_name || ""} ${createdBy.last_name || ""}`.trim() || "System";
  }
  return createdBy ? "System" : undefined;
};

export default function WorkOrderTimeline({ workOrder, notes }: TimelineProps) {
  const events = useMemo<TimelineEvent[]>(() => {
    const rows: TimelineEvent[] = [];

    if (workOrder.created_at) {
      rows.push({
        id: "work-order-created",
        timestamp: workOrder.created_at,
        category: "Workflow",
        title: "Work Order Created",
        detail: workOrder.work_order_number,
        actor: createdByName(workOrder.created_by),
        variant: "info",
      });
    }

    if (
      !isRoutineMaintenanceWorkOrder(workOrder) &&
      workOrder.diagnosis_completed_at
    ) {
      rows.push({
        id: "diagnosis-completed",
        timestamp: workOrder.diagnosis_completed_at,
        category: "Diagnosis",
        title: "Diagnosis Completed",
        detail: workOrder.diagnosis_notes || undefined,
        variant: "secondary",
      });
    }

    if (workOrder.approval_requested_at) {
      rows.push({
        id: "approval-requested",
        timestamp: workOrder.approval_requested_at,
        category: "Approval",
        title: "Customer Approval Requested",
        detail: workOrder.estimated_total ? `Estimate total ${workOrder.estimated_total}` : undefined,
        variant: "warning",
      });
    }

    if (workOrder.approved_at) {
      rows.push({
        id: "work-order-approved",
        timestamp: workOrder.approved_at,
        category: "Approval",
        title: "Work Order Approved",
        detail: workOrder.approval_method ? `Method: ${workOrder.approval_method.replace(/_/g, " ")}` : undefined,
        variant: "success",
      });
    }

    if (workOrder.started_at) {
      rows.push({
        id: "repair-started",
        timestamp: workOrder.started_at,
        category: "Repair",
        title: "Repair Work Started",
        actor: workOrder.primary_technician_name,
        variant: "info",
      });
    }

    if (workOrder.quality_check_at) {
      rows.push({
        id: "quality-check",
        timestamp: workOrder.quality_check_at,
        category: "QC",
        title: `Quality Check ${workOrder.quality_check_passed ? "Passed" : "Failed"}`,
        detail: workOrder.quality_check_notes || undefined,
        variant: workOrder.quality_check_passed ? "success" : "danger",
      });
    }

    if (workOrder.completed_at) {
      rows.push({
        id: "completed",
        timestamp: workOrder.completed_at,
        category: "Workflow",
        title: "Work Order Completed",
        variant: "success",
      });
    }

    if (workOrder.estimate_summary?.created_at) {
      rows.push({
        id: `estimate-created-${workOrder.estimate_summary.id}`,
        timestamp: workOrder.estimate_summary.created_at,
        category: "Commercial",
        title: "Stores Quote Created",
        detail: `${workOrder.estimate_summary.estimate_number} - ${workOrder.estimate_summary.status.replace(/_/g, " ")}`,
        variant: "info",
      });
    }

    if (workOrder.estimate_summary?.approved_date) {
      rows.push({
        id: `estimate-approved-${workOrder.estimate_summary.id}`,
        timestamp: workOrder.estimate_summary.approved_date,
        category: "Commercial",
        title: "Stores Quote Approved",
        detail: `${workOrder.estimate_summary.estimate_number} - Total ${workOrder.estimate_summary.total}`,
        variant: "success",
      });
    }

    if (workOrder.invoice_summary?.created_at) {
      rows.push({
        id: `invoice-created-${workOrder.invoice_summary.id}`,
        timestamp: workOrder.invoice_summary.created_at,
        category: "Billing",
        title: "Invoice Created",
        detail: `${workOrder.invoice_summary.invoice_number} - ${workOrder.invoice_summary.status.replace(/_/g, " ")}`,
        variant: "warning",
      });
    }

    if (workOrder.invoice_summary?.paid_at) {
      rows.push({
        id: `invoice-paid-${workOrder.invoice_summary.id}`,
        timestamp: workOrder.invoice_summary.paid_at,
        category: "Billing",
        title: "Invoice Paid",
        detail: `${workOrder.invoice_summary.invoice_number} - Paid ${workOrder.invoice_summary.amount_paid || ""}`,
        variant: "success",
      });
    }

    notes.forEach((note) => {
      if (!note.created_at) return;
      rows.push({
        id: `note-${note.id || note.created_at}`,
        timestamp: note.created_at,
        category: "Note",
        title: note.note_type === "customer" ? "Customer Note" : note.is_important ? "Important Note" : "Internal Note",
        detail: note.note || note.text || note.content,
        actor: note.created_by_name || note.author_name,
        variant: note.is_important ? "danger" : note.note_type === "customer" ? "info" : "secondary",
      });
    });

    return rows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [workOrder, notes]);

  return (
    <Card>
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-base">Activity Timeline</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          {events.length} event{events.length === 1 ? "" : "s"} recorded
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-10 text-center">
            <Clock className="h-9 w-9 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium text-foreground">No timeline events yet</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">Date</TableHead>
                  <TableHead className="w-[130px]">Category</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead className="w-[170px]">Actor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => {
                  const date = formatDate(event.timestamp);
                  return (
                    <TableRow key={event.id}>
                      <TableCell className="align-top text-xs text-muted-foreground">
                        {date.date}
                        {date.time && <div>{date.time}</div>}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant={event.variant || "secondary"}>{event.category}</Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="text-sm font-medium text-foreground">{event.title}</div>
                        {event.detail && (
                          <p className="mt-1 w-full whitespace-pre-wrap text-xs text-muted-foreground">
                            {event.detail}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="align-top text-sm text-muted-foreground">
                        {event.actor || "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
