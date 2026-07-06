"use client";

import React, { useState } from "react";
import { AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

interface AdditionalWorkFormProps {
    onSubmit: (notes: string) => void;
    onCancel: () => void;
    isSubmitting: boolean;
}

export function AdditionalWorkForm({
    onSubmit,
    onCancel,
    isSubmitting,
}: AdditionalWorkFormProps) {
    const [notes, setNotes] = useState("");

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        onSubmit(notes);
    };

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 pb-4">
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="additional_work_notes" className="block mb-2 text-foreground">
                            Describe Additional Work Found *
                        </Label>
                        <Textarea
                            id="additional_work_notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            required
                            rows={4}
                            placeholder="Describe the new problems discovered..."
                            className="w-full bg-muted border-border text-foreground"
                        />
                    </div>
                    <div className="rounded-lg border border-warning/20 bg-warning/15 p-3">
                        <p className="text-sm text-warning-foreground">
                            <AlertCircle className="w-4 h-4 inline mr-1.5" />
                            This will pause the work order and require customer approval before continuing.
                        </p>
                    </div>
                </div>
            </div>
            <DialogFooter className="shrink-0 px-6 pb-6 pt-4 border-t border-border/50">
                <Button type="button" variant="secondary" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !notes.trim()}>
                    {isSubmitting ? "Flagging..." : "Flag Additional Work"}
                </Button>
            </DialogFooter>
        </div>
    );
}
