"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    tillApi,
    type RecordTillMovementRequest,
} from "@/lib/api/till-refund";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/lib/hooks/useToast";

function getRecordMovementError(error: unknown): string {
    const data = (error as { response?: { data?: unknown } })?.response?.data;
    if (!data || typeof data !== "object") return "Failed to record movement";
    const d = data as Record<string, unknown>;
    if (typeof d.error === "string") return d.error;
    for (const key of ["amount", "movement_type", "non_field_errors"]) {
        const v = d[key];
        if (Array.isArray(v) && v[0]) return String(v[0]);
        if (typeof v === "string") return v;
    }
    return "Failed to record movement";
}

export function RecordTillMovementDialog({
    tillId,
    open,
    onOpenChange,
}: {
    tillId: number;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const [movementType, setMovementType] = useState<"pay_in" | "pay_out">(
        "pay_in"
    );
    const [amount, setAmount] = useState("");
    const [reason, setReason] = useState("");
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const mutation = useMutation({
        mutationFn: (payload: RecordTillMovementRequest) =>
            tillApi.recordMovement(tillId, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["current-till"] });
            queryClient.invalidateQueries({ queryKey: ["till-detail", tillId] });
            queryClient.invalidateQueries({ queryKey: ["today-tills"] });
            queryClient.invalidateQueries({
                queryKey: ["till-movements", tillId],
            });
            toast({
                title: "Recorded",
                description: "Cash movement saved to the till.",
            });
            onOpenChange(false);
            setAmount("");
            setReason("");
            setMovementType("pay_in");
        },
        onError: (error: unknown) => {
            toast({
                title: "Could not record",
                description: getRecordMovementError(error),
                variant: "destructive",
            });
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const n = parseFloat(amount);
        if (Number.isNaN(n) || n <= 0) {
            toast({
                title: "Invalid amount",
                description: "Enter a positive amount.",
                variant: "destructive",
            });
            return;
        }
        mutation.mutate({
            movement_type: movementType,
            amount: n.toFixed(2),
            reason: reason.trim() || undefined,
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-md"
                onClick={(e) => e.stopPropagation()}
            >
                <DialogClose onOpenChange={onOpenChange} />
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>Pay in / Pay out</DialogTitle>
                        <p className="text-sm text-muted-foreground">
                            Record cash added to or removed from the drawer (float,
                            safe drop, bank change, etc.). This updates expected
                            balance and the ledger.
                        </p>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="movement-type">Type</Label>
                            <Select
                                value={movementType}
                                onValueChange={(v) =>
                                    setMovementType(v as "pay_in" | "pay_out")
                                }
                            >
                                <SelectTrigger id="movement-type">
                                    <SelectValue placeholder="Choose type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="pay_in">
                                        Pay in — cash into drawer
                                    </SelectItem>
                                    <SelectItem value="pay_out">
                                        Pay out — cash out of drawer
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="movement-amount">Amount</Label>
                            <Input
                                id="movement-amount"
                                type="number"
                                inputMode="decimal"
                                min="0.01"
                                step="0.01"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="movement-reason">Reason (optional)</Label>
                            <Textarea
                                id="movement-reason"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="e.g. Float from safe, mid-shift drop"
                                rows={2}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={mutation.isPending}>
                            {mutation.isPending ? "Saving…" : "Save"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
