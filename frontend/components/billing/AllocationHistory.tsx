"use client";

import { useQuery } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Receipt, User, Calendar } from "lucide-react";
import { useCurrency } from "@/lib/hooks/useCurrency";

interface AllocationHistoryProps {
    paymentId: number;
}

export function AllocationHistory({ paymentId }: AllocationHistoryProps) {
    const { formatCurrency } = useCurrency();
    const { data: allocations, isLoading } = useQuery({
        queryKey: ["payment-allocations", paymentId],
        queryFn: () => billingApi.payments.allocations(paymentId),
        enabled: !!paymentId,
    });

    const { data: unallocatedData } = useQuery({
        queryKey: ["payment-unallocated", paymentId],
        queryFn: () => billingApi.payments.unallocatedAmount(paymentId),
        enabled: !!paymentId,
    });

    if (isLoading) {
        return (
            <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground">Loading allocation history...</p>
            </div>
        );
    }

    if (!allocations || allocations.length === 0) {
        return (
            <div className="mt-3 pt-3 border-t border-border">
                <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-md">
                    <Receipt className="w-3.5 h-3.5" />
                    <span className="font-medium">No allocation recorded</span>
                    <span className="text-muted-foreground">- Payment not yet allocated to specific invoices</span>
                </div>
            </div>
        );
    }

    const paymentAmount = parseFloat(unallocatedData?.payment_amount || "0");
    const allocatedAmount = parseFloat(unallocatedData?.allocated || "0");
    const unallocatedAmount = parseFloat(unallocatedData?.unallocated || "0");
    const hasUnallocated = unallocatedAmount > 0.01;

    return (
        <div className="mt-3 pt-3 border-t border-border">
            <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    Allocation History
                </h4>
                {hasUnallocated && (
                    <Badge variant="warning" className="text-xs">
                        {formatCurrency(unallocatedAmount)} Unallocated
                    </Badge>
                )}
            </div>

            <div className="space-y-2">
                {allocations.map((allocation) => (
                    <div
                        key={allocation.id}
                        className="bg-card/50 border border-border rounded-md p-3"
                    >
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <Receipt className="w-3.5 h-3.5 text-primary" />
                                    <span className="text-sm font-medium text-foreground">
                                        Invoice {allocation.invoice_number}
                                    </span>
                                    <span className="text-sm font-bold text-green-600">
                                        {formatCurrency(parseFloat(allocation.amount))}
                                    </span>
                                </div>

                                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                    <div className="flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        <span>{format(new Date(allocation.allocated_at), "MMM dd, yyyy HH:mm")}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <User className="w-3 h-3" />
                                        <span>by {allocation.allocated_by_name}</span>
                                    </div>
                                </div>

                                {allocation.notes && (
                                    <p className="text-xs text-muted-foreground italic mt-2 pl-5">
                                        "{allocation.notes}"
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Summary */}
            <div className="mt-3 pt-2 border-t border-border">
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Payment:</span>
                        <span className="font-semibold text-foreground">
                            {formatCurrency(paymentAmount)}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Allocated:</span>
                        <span className="font-semibold text-green-600">
                            {formatCurrency(allocatedAmount)}
                        </span>
                    </div>
                </div>
                {hasUnallocated && (
                    <div className="flex justify-between text-xs mt-1 text-amber-600 font-medium">
                        <span>Unallocated Balance:</span>
                        <span>{formatCurrency(unallocatedAmount)}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
