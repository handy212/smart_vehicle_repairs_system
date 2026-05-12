"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tillApi, type CloseTillRequest } from "@/lib/api/till-refund";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Calculator } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/lib/hooks/useToast";
import { Skeleton } from "@/components/ui/skeleton";

import { useCurrency } from "@/lib/hooks/useCurrency";
const DENOMINATIONS = [200, 100, 50, 20, 10, 5, 2, 1, 0.50, 0.25, 0.10, 0.05];

function getApiErrorMessage(error: unknown, fallback: string) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    return response?.data?.error || fallback;
}

export default function CloseTillPage() {
    const { formatCurrency } = useCurrency();
    const params = useParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const tillId = parseInt(params.id as string, 10);
    const isValidTillId = Number.isFinite(tillId) && tillId > 0;

    const [counts, setCounts] = useState<Record<string, number>>(
        DENOMINATIONS.reduce((acc, denom) => ({ ...acc, [denom.toString()]: 0 }), {})
    );
    const [notes, setNotes] = useState("");

    const { data: till, isLoading } = useQuery({
        queryKey: ['till-detail', tillId],
        queryFn: () => tillApi.get(tillId),
        enabled: isValidTillId,
    });

    const closeMutation = useMutation({

        mutationFn: (data: CloseTillRequest) => tillApi.close(tillId, data),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['current-till'] });
            queryClient.invalidateQueries({ queryKey: ['today-tills'] });
            queryClient.invalidateQueries({ queryKey: ['till-detail', tillId] });
            queryClient.invalidateQueries({ queryKey: ['till-movements', tillId] });
            toast({
                title: "Till Closed",
                description: `Variance: ${formatCurrency(parseFloat(String(data.variance)))} ${data.is_balanced ? "✓ Balanced" : "✗ Not Balanced"}`,
            });
            router.push('/billing/tills');
        },

        onError: (error: unknown) => {
            toast({
                title: "Error",
                description: getApiErrorMessage(error, "Failed to close till"),
                variant: "destructive",
            });
        },
    });

    const handleCountChange = (denom: string, value: string) => {
        const qty = parseInt(value) || 0;
        setCounts(prev => ({ ...prev, [denom]: qty }));
    };

    const calculateTotal = () => {
        return DENOMINATIONS.reduce((sum, denom) => {
            return sum + (denom * (counts[denom.toString()] || 0));
        }, 0);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const cash_counts = DENOMINATIONS
            .filter(denom => (counts[denom.toString()] || 0) > 0)
            .map(denom => ({
                denomination: denom.toString(),
                quantity: counts[denom.toString()],
            }));

        if (cash_counts.length === 0) {
            toast({
                title: "Error",
                description: "Please count at least one denomination",
                variant: "destructive",
            });
            return;
        }

        closeMutation.mutate({ cash_counts, notes });
    };

    if (!isValidTillId) {
        return (
            <div className="p-8">
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-center text-muted-foreground">Invalid till ID</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="p-8 space-y-6">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-96 w-full" />
            </div>
        );
    }

    if (!till) {
        return (
            <div className="p-8">
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-center text-muted-foreground">Till not found</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const total = calculateTotal();
    const expectedBook = parseFloat(till.current_expected_balance || till.opening_balance);
    const provisionalVariance = total - expectedBook;
    const netMove = parseFloat(till.till_cash_movements_net || "0");

    return (
        <div className="p-8 space-y-6">
            {/* Back Button */}
            <Button variant="ghost" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Tills
            </Button>

            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Close Till #{till.id}</h1>
                <p className="text-sm text-muted-foreground mt-1">Count cash and close register</p>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Cash Counter */}
                    <div className="lg:col-span-2">
                        <Card className="border shadow-sm">
                            <CardHeader className="pb-3 border-b">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Calculator className="h-4 w-4" />
                                    Cash count
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {DENOMINATIONS.map((denom) => (
                                        <div key={denom} className="grid grid-cols-4 gap-4 items-center">
                                            <div className="font-semibold">
                                                {formatCurrency(denom)}
                                            </div>
                                            <div className="col-span-2">
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    value={counts[denom.toString()] || 0}
                                                    onChange={(e) => handleCountChange(denom.toString(), e.target.value)}
                                                    className="text-center"
                                                />
                                            </div>
                                            <div className="text-right font-mono">
                                                = {formatCurrency((denom * (counts[denom.toString()] || 0)))}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-4">
                                    <Label htmlFor="notes">Notes (Optional)</Label>
                                    <Textarea
                                        id="notes"
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="Any discrepancies or notes..."
                                        className="mt-1"
                                        rows={3}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Summary */}
                    <div className="space-y-4">
                        <Card className="border shadow-sm">
                            <CardHeader className="pb-3 border-b">
                                <CardTitle className="text-base">Summary</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4 pt-4">
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                    <div className="rounded-md border bg-muted/30 p-3">
                                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Opening</p>
                                        <p className="mt-1 text-sm font-semibold tabular-nums">
                                            {formatCurrency(parseFloat(till.opening_balance))}
                                        </p>
                                    </div>
                                    <div className="rounded-md border bg-muted/30 p-3">
                                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Expected</p>
                                        <p className="mt-1 text-sm font-semibold tabular-nums">
                                            {formatCurrency(expectedBook)}
                                        </p>
                                    </div>
                                    <div className="rounded-md border bg-muted/30 p-3 col-span-2 sm:col-span-1">
                                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Counted</p>
                                        <p className="mt-1 text-sm font-semibold tabular-nums text-primary">
                                            {formatCurrency(total)}
                                        </p>
                                    </div>
                                    <div className="rounded-md border bg-muted/30 p-3">
                                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Collected</p>
                                        <p className="mt-1 text-sm font-semibold tabular-nums">
                                            {formatCurrency(parseFloat(till.cash_payments_total || "0"))}
                                        </p>
                                    </div>
                                    <div className="rounded-md border bg-muted/30 p-3">
                                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Refunded</p>
                                        <p className="mt-1 text-sm font-semibold tabular-nums">
                                            {formatCurrency(parseFloat(till.cash_refunds_total || "0"))}
                                        </p>
                                    </div>
                                    <div className="rounded-md border bg-muted/30 p-3">
                                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Net in/out</p>
                                        <p className={`mt-1 text-sm font-semibold tabular-nums ${netMove < 0 ? "text-destructive" : ""}`}>
                                            {netMove > 0 ? "+" : ""}
                                            {formatCurrency(netMove)}
                                        </p>
                                    </div>
                                </div>
                                <div className="rounded-md border border-dashed p-3 text-xs">
                                    <p className="text-muted-foreground">Provisional variance (counted − expected)</p>
                                    <p
                                        className={`mt-1 text-sm font-semibold tabular-nums ${
                                            Math.abs(provisionalVariance) < 0.01
                                                ? "text-success"
                                                : provisionalVariance > 0
                                                  ? "text-foreground"
                                                  : "text-destructive"
                                        }`}
                                    >
                                        {provisionalVariance > 0 ? "+" : ""}
                                        {formatCurrency(provisionalVariance)}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                                    <span>
                                        Duration{" "}
                                        <span className="font-medium text-foreground">{till.duration || "—"}</span>
                                    </span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="pt-6 space-y-3">
                                <Button
                                    type="submit"
                                    disabled={closeMutation.isPending || total === 0}
                                    className="w-full"
                                    size="lg"
                                >
                                    {closeMutation.isPending ? 'Closing Till...' : 'Close Till'}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => router.back()}
                                    className="w-full"
                                >
                                    Cancel
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </form>
        </div>
    );
}
