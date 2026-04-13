"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { Clock, FileCheck, Receipt, CreditCard } from "lucide-react";
import { WorkOrder } from "@/lib/api/workorders";

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

export default function WorkOrderTimeline({ workOrder, notes }: TimelineProps) {
    const formatWorkflowTimestamp = (timestamp?: string | null) => {
        if (!timestamp) {
            return "";
        }

        const isMidnightStamp = /T00:00:00(?:\.000)?(?:Z|[+-]\d{2}:\d{2})?$/.test(timestamp);
        return format(
            new Date(timestamp),
            isMidnightStamp ? "MMM dd, yyyy" : "MMM dd, yyyy 'at' h:mm a"
        );
    };

    const commercialEvents = [
        workOrder.estimate_summary?.created_at
            ? {
                id: `estimate-created-${workOrder.estimate_summary.id}`,
                title: "Stores Quote Created",
                timestamp: workOrder.estimate_summary.created_at,
                subtitle: `${workOrder.estimate_summary.estimate_number} • ${workOrder.estimate_summary.status.replace(/_/g, " ")}`,
                color: "bg-primary",
                icon: FileCheck,
            }
            : null,
        workOrder.estimate_summary?.approved_date
            ? {
                id: `estimate-approved-${workOrder.estimate_summary.id}`,
                title: "Stores Quote Approved",
                timestamp: workOrder.estimate_summary.approved_date,
                subtitle: `${workOrder.estimate_summary.estimate_number} • Total ${workOrder.estimate_summary.total}`,
                color: "bg-success/100",
                icon: FileCheck,
            }
            : null,
        workOrder.invoice_summary?.created_at
            ? {
                id: `invoice-created-${workOrder.invoice_summary.id}`,
                title: "Invoice Created",
                timestamp: workOrder.invoice_summary.created_at,
                subtitle: `${workOrder.invoice_summary.invoice_number} • ${workOrder.invoice_summary.status.replace(/_/g, " ")}`,
                color: "bg-warning/100",
                icon: Receipt,
            }
            : null,
        workOrder.invoice_summary?.paid_at
            ? {
                id: `invoice-paid-${workOrder.invoice_summary.id}`,
                title: "Invoice Paid",
                timestamp: workOrder.invoice_summary.paid_at,
                subtitle: `${workOrder.invoice_summary.invoice_number} • Paid ${workOrder.invoice_summary.amount_paid}`,
                color: "bg-success",
                icon: CreditCard,
            }
            : null,
    ].filter(Boolean) as Array<{
        id: string;
        title: string;
        timestamp: string;
        subtitle: string;
        color: string;
        icon: typeof Clock;
    }>;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Activity Timeline</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                    Chronological view of work order events and activities
                </p>
            </CardHeader>
            <CardContent>
                <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border"></div>

                    <div className="space-y-6 pl-8">
                        {/* Work Order Created */}
                        {workOrder.created_at && (
                            <div className="relative flex items-start">
                                <div className="absolute -left-10 w-3 h-3 rounded-full bg-primary border-2 border-white border-border shadow-sm"></div>
                                <div className="flex-1 pt-0.5">
                                    <p className="text-sm font-semibold text-foreground">
                                        Work Order Created
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {formatWorkflowTimestamp(workOrder.created_at)}
                                    </p>
                                    {workOrder.created_by && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Created by:{" "}
                                            {typeof workOrder.created_by === "object"
                                                ? workOrder.created_by.first_name +
                                                " " +
                                                workOrder.created_by.last_name
                                                : "System"}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Status Changes */}
                        {workOrder.diagnosis_completed_at && (
                            <div className="relative flex items-start">
                                <div className="absolute -left-10 w-3 h-3 rounded-full bg-purple-500 border-2 border-white border-border shadow-sm"></div>
                                <div className="flex-1 pt-0.5">
                                    <p className="text-sm font-semibold text-foreground">
                                        Diagnosis Completed
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {formatWorkflowTimestamp(workOrder.diagnosis_completed_at)}
                                    </p>
                                </div>
                            </div>
                        )}

                        {workOrder.approval_requested_at && (
                            <div className="relative flex items-start">
                                <div className="absolute -left-10 w-3 h-3 rounded-full bg-warning/100 border-2 border-white border-border shadow-sm"></div>
                                <div className="flex-1 pt-0.5">
                                    <p className="text-sm font-semibold text-foreground">
                                        Approval Requested
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {formatWorkflowTimestamp(workOrder.approval_requested_at)}
                                    </p>
                                </div>
                            </div>
                        )}

                        {workOrder.approved_at && (
                            <div className="relative flex items-start">
                                <div className="absolute -left-10 w-3 h-3 rounded-full bg-success/100 border-2 border-white border-border shadow-sm"></div>
                                <div className="flex-1 pt-0.5">
                                    <p className="text-sm font-semibold text-foreground">
                                        Work Order Approved
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {formatWorkflowTimestamp(workOrder.approved_at)}
                                    </p>
                                    {workOrder.approval_method && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Via: {workOrder.approval_method.replace(/_/g, " ")}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {workOrder.started_at && (
                            <div className="relative flex items-start">
                                <div className="absolute -left-10 w-3 h-3 rounded-full bg-success/100 border-2 border-white border-border shadow-sm"></div>
                                <div className="flex-1 pt-0.5">
                                    <p className="text-sm font-semibold text-foreground">
                                        Work Started
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {formatWorkflowTimestamp(workOrder.started_at)}
                                    </p>
                                    {workOrder.primary_technician_name && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Technician: {workOrder.primary_technician_name}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {workOrder.quality_check_at && (
                            <div className="relative flex items-start">
                                <div
                                    className={`absolute -left-10 w-3 h-3 rounded-full border-2 border-white border-border shadow-sm ${workOrder.quality_check_passed
                                        ? "bg-success/100"
                                        : "bg-destructive/100"
                                        }`}
                                ></div>
                                <div className="flex-1 pt-0.5">
                                    <p className="text-sm font-semibold text-foreground">
                                        Quality Check{" "}
                                        {workOrder.quality_check_passed ? "Passed" : "Failed"}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {formatWorkflowTimestamp(workOrder.quality_check_at)}
                                    </p>
                                </div>
                            </div>
                        )}

                        {workOrder.completed_at && (
                            <div className="relative flex items-start">
                                <div className="absolute -left-10 w-3 h-3 rounded-full bg-success border-2 border-white border-border shadow-sm"></div>
                                <div className="flex-1 pt-0.5">
                                    <p className="text-sm font-semibold text-foreground">
                                        Work Order Completed
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {formatWorkflowTimestamp(workOrder.completed_at)}
                                    </p>
                                </div>
                            </div>
                        )}

                        {commercialEvents.length > 0 && (
                            <>
                                <div className="border-t border-border pt-6 mt-4">
                                    <p className="text-sm font-semibold text-card-foreground mb-4">
                                        Commercial Flow
                                    </p>
                                </div>
                                {commercialEvents.map((event) => {
                                    const Icon = event.icon;
                                    return (
                                        <div key={event.id} className="relative flex items-start">
                                            <div className={`absolute -left-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white border-border shadow-sm ${event.color}`}>
                                                <Icon className="h-3 w-3 text-white" />
                                            </div>
                                            <div className="flex-1 pt-0.5">
                                                <p className="text-sm font-semibold text-foreground">{event.title}</p>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {formatWorkflowTimestamp(event.timestamp)}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-1">{event.subtitle}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </>
                        )}

                        {/* Notes Timeline */}
                        {notes.length > 0 && (
                            <>
                                <div className="border-t border-border pt-6 mt-4">
                                    <p className="text-sm font-semibold text-card-foreground mb-4">
                                        Notes & Activity
                                    </p>
                                </div>
                                {notes
                                    .sort(
                                        (a, b) =>
                                            new Date(b.created_at || 0).getTime() -
                                            new Date(a.created_at || 0).getTime()
                                    )
                                    .map((note) => (
                                        <div key={note.id} className="relative flex items-start">
                                            <div
                                                className={`absolute -left-10 w-3 h-3 rounded-full border-2 border-white border-border shadow-sm ${note.note_type === "customer"
                                                    ? "bg-primary"
                                                    : note.is_important
                                                        ? "bg-destructive/100"
                                                        : "bg-gray-400"
                                                    }`}
                                            ></div>
                                            <div className="flex-1 pt-0.5">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <p className="text-sm font-semibold text-foreground">
                                                        {note.note_type === "customer"
                                                            ? "Customer Note"
                                                            : note.is_important
                                                                ? "Important Note"
                                                                : "Internal Note"}
                                                    </p>
                                                </div>
                                                <p className="text-sm text-card-foreground mt-1 whitespace-pre-wrap">
                                                    {note.note || note.text || note.content}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {formatWorkflowTimestamp(note.created_at)}
                                                    {note.created_by_name &&
                                                        ` • ${note.created_by_name}`}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                            </>
                        )}

                        {!workOrder.created_at && notes.length === 0 && (
                            <div className="text-center py-8">
                                <Clock className="w-12 h-12 text-gray-300 text-muted-foreground mx-auto mb-3" />
                                <p className="text-sm text-muted-foreground">No timeline events yet.</p>
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
