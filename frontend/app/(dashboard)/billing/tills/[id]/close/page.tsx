"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tillApi } from "@/lib/api/till-refund";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Calculator } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/lib/hooks/useToast";
import { Skeleton } from "@/components/ui/skeleton";

const DENOMINATIONS = [200, 100, 50, 20, 10, 5, 2, 1, 0.50, 0.25, 0.10, 0.05];

export default function CloseTillPage() {
    const params = useParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const tillId = parseInt(params.id as string);

    const [counts, setCounts] = useState<Record<string, number>>(
        DENOMINATIONS.reduce((acc, denom) => ({ ...acc, [denom.toString()]: 0 }), {})
    );
    const [notes, setNotes] = useState("");

    const { data: till, isLoading } = useQuery({
        queryKey: ['till-detail', tillId],
        queryFn: () => tillApi.get(tillId),
        enabled: !!tillId,
    });

    const closeMutation = useMutation({
        mutationFn: (data: any) => tillApi.close(tillId, data),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['current-till'] });
            queryClient.invalidateQueries({ queryKey: ['today-tills'] });
            toast({
                title: "Till Closed",
                description: `Variance: $${data.variance} ${data.is_balanced ? '✓ Balanced' : '✗ Not Balanced'}`
            });
            router.push('/billing/tills');
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.error || "Failed to close till",
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

    return (
        <div className="p-8 space-y-6">
            {/* Back Button */}
            <Button variant="ghost" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Tills
            </Button>

            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold">Close Till #{till.id}</h1>
                <p className="text-muted-foreground mt-1">Count cash and close register</p>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Cash Counter */}
                    <div className="lg:col-span-2">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Calculator className="h-5 w-5" />
                                    Cash Count
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {DENOMINATIONS.map((denom) => (
                                        <div key={denom} className="grid grid-cols-4 gap-4 items-center">
                                            <div className="font-semibold">
                                                ${denom.toFixed(2)}
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
                                                = ${(denom * (counts[denom.toString()] || 0)).toFixed(2)}
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
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Summary</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <p className="text-sm text-muted-foreground">Opening Balance</p>
                                    <p className="text-2xl font-bold">${parseFloat(till.opening_balance).toFixed(2)}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Counted Total</p>
                                    <p className="text-3xl font-bold text-blue-600">${total.toFixed(2)}</p>
                                </div>
                                <div className="pt-4 border-t">
                                    <p className="text-sm text-muted-foreground">Duration</p>
                                    <p className="font-semibold">{till.duration || 'N/A'}</p>
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
