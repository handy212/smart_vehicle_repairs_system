"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { Clock } from "lucide-react";

interface TimelineProps {
    workOrder: any;
    notes: any[];
}

export default function WorkOrderTimeline({ workOrder, notes }: TimelineProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Activity Timeline</CardTitle>
                <p className="text-sm text-gray-500 mt-1">
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
                                <div className="absolute -left-10 w-3 h-3 rounded-full bg-primary border-2 border-white dark:border-gray-800 shadow-sm"></div>
                                <div className="flex-1 pt-0.5">
                                    <p className="text-sm font-semibold text-foreground">
                                        Work Order Created
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {format(
                                            new Date(workOrder.created_at),
                                            "MMM dd, yyyy 'at' h:mm a"
                                        )}
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
                                <div className="absolute -left-10 w-3 h-3 rounded-full bg-purple-500 border-2 border-white dark:border-gray-800 shadow-sm"></div>
                                <div className="flex-1 pt-0.5">
                                    <p className="text-sm font-semibold text-foreground">
                                        Diagnosis Completed
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {format(
                                            new Date(workOrder.diagnosis_completed_at),
                                            "MMM dd, yyyy 'at' h:mm a"
                                        )}
                                    </p>
                                </div>
                            </div>
                        )}

                        {workOrder.approval_requested_at && (
                            <div className="relative flex items-start">
                                <div className="absolute -left-10 w-3 h-3 rounded-full bg-warning/100 border-2 border-white dark:border-gray-800 shadow-sm"></div>
                                <div className="flex-1 pt-0.5">
                                    <p className="text-sm font-semibold text-foreground">
                                        Approval Requested
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {format(
                                            new Date(workOrder.approval_requested_at),
                                            "MMM dd, yyyy 'at' h:mm a"
                                        )}
                                    </p>
                                </div>
                            </div>
                        )}

                        {workOrder.approved_at && (
                            <div className="relative flex items-start">
                                <div className="absolute -left-10 w-3 h-3 rounded-full bg-success/100 border-2 border-white dark:border-gray-800 shadow-sm"></div>
                                <div className="flex-1 pt-0.5">
                                    <p className="text-sm font-semibold text-foreground">
                                        Work Order Approved
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {format(
                                            new Date(workOrder.approved_at),
                                            "MMM dd, yyyy 'at' h:mm a"
                                        )}
                                    </p>
                                    {workOrder.approval_method && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Via: {workOrder.approval_method.replace("_", " ")}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {workOrder.started_at && (
                            <div className="relative flex items-start">
                                <div className="absolute -left-10 w-3 h-3 rounded-full bg-success/100 border-2 border-white dark:border-gray-800 shadow-sm"></div>
                                <div className="flex-1 pt-0.5">
                                    <p className="text-sm font-semibold text-foreground">
                                        Work Started
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {format(
                                            new Date(workOrder.started_at),
                                            "MMM dd, yyyy 'at' h:mm a"
                                        )}
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
                                    className={`absolute -left-10 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800 shadow-sm ${workOrder.quality_check_passed
                                            ? "bg-success/100"
                                            : "bg-red-500"
                                        }`}
                                ></div>
                                <div className="flex-1 pt-0.5">
                                    <p className="text-sm font-semibold text-foreground">
                                        Quality Check{" "}
                                        {workOrder.quality_check_passed ? "Passed" : "Failed"}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {format(
                                            new Date(workOrder.quality_check_at),
                                            "MMM dd, yyyy 'at' h:mm a"
                                        )}
                                    </p>
                                </div>
                            </div>
                        )}

                        {workOrder.completed_at && (
                            <div className="relative flex items-start">
                                <div className="absolute -left-10 w-3 h-3 rounded-full bg-success border-2 border-white dark:border-gray-800 shadow-sm"></div>
                                <div className="flex-1 pt-0.5">
                                    <p className="text-sm font-semibold text-foreground">
                                        Work Order Completed
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {format(
                                            new Date(workOrder.completed_at),
                                            "MMM dd, yyyy 'at' h:mm a"
                                        )}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Notes Timeline */}
                        {notes.length > 0 && (
                            <>
                                <div className="border-t dark:border-gray-700 pt-6 mt-4">
                                    <p className="text-sm font-semibold text-card-foreground mb-4">
                                        Notes & Activity
                                    </p>
                                </div>
                                {notes
                                    .sort(
                                        (a: any, b: any) =>
                                            new Date(b.created_at).getTime() -
                                            new Date(a.created_at).getTime()
                                    )
                                    .map((note: any) => (
                                        <div key={note.id} className="relative flex items-start">
                                            <div
                                                className={`absolute -left-10 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800 shadow-sm ${note.note_type === "customer"
                                                        ? "bg-orange-400"
                                                        : note.is_important
                                                            ? "bg-red-500"
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
                                                    {note.note}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {format(
                                                        new Date(note.created_at),
                                                        "MMM dd, yyyy 'at' h:mm a"
                                                    )}
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
                                <Clock className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                                <p className="text-sm text-gray-500">No timeline events yet.</p>
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
