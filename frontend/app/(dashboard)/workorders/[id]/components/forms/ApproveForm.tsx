"use client";

import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

interface ApproveFormProps {
    onSubmit: (data: any) => void;
    onCancel: () => void;
    isSubmitting: boolean;
}

export function ApproveForm({
    onSubmit,
    onCancel,
    isSubmitting,
}: ApproveFormProps) {
    const [approvalMethod, setApprovalMethod] = useState("phone");
    const [approvalNotes, setApprovalNotes] = useState("");

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        onSubmit({
            approval_method: approvalMethod,
            approval_notes: approvalNotes,
        });
    };

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 pb-4">
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="approval_method" className="block mb-2 text-foreground">
                            Approval Method
                        </Label>
                        <select
                            id="approval_method"
                            value={approvalMethod}
                            onChange={(e) => setApprovalMethod(e.target.value)}
                            className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-muted text-foreground"
                        >
                            <option value="phone">Phone</option>
                            <option value="email">Email</option>
                            <option value="in_person">In Person</option>
                            <option value="text">Text/SMS</option>
                        </select>
                    </div>
                    <div>
                        <Label htmlFor="approval_notes" className="block mb-2 text-foreground">
                            Notes
                        </Label>
                        <Textarea
                            id="approval_notes"
                            value={approvalNotes}
                            onChange={(e) => setApprovalNotes(e.target.value)}
                            rows={3}
                            className="w-full bg-muted border-border text-foreground"
                        />
                    </div>
                </div>
            </div>
            <DialogFooter className="shrink-0 px-6 pb-6 pt-4 border-t border-border/50">
                <Button type="button" variant="secondary" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
                    {isSubmitting ? "Approving..." : "Approve"}
                </Button>
            </DialogFooter>
        </div>
    );
}
