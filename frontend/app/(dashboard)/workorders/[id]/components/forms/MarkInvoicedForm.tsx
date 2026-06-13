"use client";

import React, { useState } from "react";
import { AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

interface MarkInvoicedFormProps {
    onSubmit: (data: any) => void;
    onCancel: () => void;
    isSubmitting: boolean;
    workOrder?: any;
}

export function MarkInvoicedForm({
    onSubmit,
    onCancel,
    isSubmitting,
    workOrder,
}: MarkInvoicedFormProps) {
    const [odometerOut, setOdometerOut] = useState("");
    const odometerIn = workOrder?.odometer_in || 0;
    const existingOdometerOut = workOrder?.odometer_out;

    React.useEffect(() => {
        if (existingOdometerOut) {
            setOdometerOut(existingOdometerOut.toString());
        } else if (odometerIn) {
            setOdometerOut(odometerIn.toString());
        }
    }, [existingOdometerOut, odometerIn]);

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!odometerOut) return;
        onSubmit({ odometer_out: parseInt(odometerOut) });
    };

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 pb-4">
                <div className="space-y-4">
                    <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
                        <p className="text-sm text-primary">
                            <AlertCircle className="w-4 h-4 inline mr-1.5" />
                            Odometer reading is required before confirming billing is complete.
                        </p>
                    </div>

                    <div>
                        <Label htmlFor="mark_invoiced_odometer_out" className="block mb-2 text-foreground">
                            Odometer Out (km) <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="mark_invoiced_odometer_out"
                            type="number"
                            value={odometerOut}
                            onChange={(e) => setOdometerOut(e.target.value)}
                            placeholder={odometerIn ? `Odometer In: ${odometerIn}` : "Enter odometer reading"}
                            min={odometerIn || 0}
                            required
                            className="w-full bg-muted border-border text-foreground"
                        />
                        {odometerIn > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                                Odometer In: {odometerIn.toLocaleString()} km
                            </p>
                        )}
                    </div>
                </div>
            </div>
            <DialogFooter className="shrink-0 px-6 pb-6 pt-4 border-t border-border/50">
                <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !odometerOut}>
                    {isSubmitting ? "Saving..." : "Confirm Billing Complete"}
                </Button>
            </DialogFooter>
        </div>
    );
}
