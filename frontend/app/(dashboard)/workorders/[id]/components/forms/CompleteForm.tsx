"use client";

import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

interface CompleteFormProps {
    onSubmit: (data: any) => void;
    onCancel: () => void;
    isSubmitting: boolean;
}

export function CompleteForm({
    onSubmit,
    onCancel,
    isSubmitting,
}: CompleteFormProps) {
    const [odometerOut, setOdometerOut] = useState("");
    const [completionNotes, setCompletionNotes] = useState("");

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        onSubmit({
            odometer_out: odometerOut ? parseInt(odometerOut) : undefined,
            completion_notes: completionNotes,
        });
    };

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 pb-4">
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="odometer_out" className="block mb-2 text-foreground">
                            Odometer Out (km)
                        </Label>
                        <Input
                            id="odometer_out"
                            type="number"
                            value={odometerOut}
                            onChange={(e) => setOdometerOut(e.target.value)}
                            className="w-full bg-muted border-border text-foreground"
                        />
                    </div>
                    <div>
                        <Label htmlFor="completion_notes" className="block mb-2 text-foreground">
                            Completion Notes
                        </Label>
                        <Textarea
                            id="completion_notes"
                            value={completionNotes}
                            onChange={(e) => setCompletionNotes(e.target.value)}
                            rows={4}
                            placeholder="Add any notes about the completion..."
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
                    {isSubmitting ? "Completing..." : "Complete Work Order"}
                </Button>
            </DialogFooter>
        </div>
    );
}
