"use client";

import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

interface PauseFormProps {
    onSubmit: (reason: string) => void;
    onCancel: () => void;
    isSubmitting: boolean;
}

export function PauseForm({
    onSubmit,
    onCancel,
    isSubmitting,
}: PauseFormProps) {
    const [reason, setReason] = useState("");

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        onSubmit(reason);
    };

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 pb-4">
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="reason" className="block mb-2 text-foreground">
                            Reason for Pause
                        </Label>
                        <Textarea
                            id="reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={3}
                            placeholder="Enter reason for pausing the work order..."
                            className="w-full bg-muted border-border text-foreground"
                        />
                    </div>
                </div>
            </div>
            <DialogFooter className="shrink-0 px-6 pb-6 pt-4 border-t border-border/50">
                <Button type="button" variant="secondary" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="button" onClick={handleSubmit} disabled={isSubmitting} variant="secondary">
                    {isSubmitting ? "Pausing..." : "Pause"}
                </Button>
            </DialogFooter>
        </div>
    );
}
