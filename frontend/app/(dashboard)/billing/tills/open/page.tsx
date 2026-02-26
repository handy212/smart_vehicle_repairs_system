"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { tillApi } from "@/lib/api/till-refund";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, DollarSign } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/lib/hooks/useToast";

export default function OpenTillPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const [openingBalance, setOpeningBalance] = useState("0.00");

    const openMutation = useMutation({
        mutationFn: (data: { opening_balance: string }) => tillApi.open(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['current-till'] });
            queryClient.invalidateQueries({ queryKey: ['today-tills'] });
            toast({ title: "Success", description: "Till opened successfully" });
            router.push('/billing/tills');
        },

        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.error || "Failed to open till",
                variant: "destructive",
            });
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const balance = parseFloat(openingBalance);
        if (isNaN(balance) || balance < 0) {
            toast({
                title: "Error",
                description: "Invalid opening balance",
                variant: "destructive",
            });
            return;
        }

        openMutation.mutate({ opening_balance: openingBalance });
    };

    return (
        <div className="p-8 space-y-6">
            {/* Back Button */}
            <Button variant="ghost" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Tills
            </Button>

            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold">Open Till</h1>
                <p className="text-muted-foreground mt-1">Start a new cash register session</p>
            </div>

            {/* Form */}
            <div className="max-w-2xl">
                <form onSubmit={handleSubmit}>
                    <Card>
                        <CardHeader>
                            <CardTitle>Till Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div>
                                <Label htmlFor="opening-balance">Opening Balance *</Label>
                                <div className="relative mt-1">
                                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                                    <Input
                                        id="opening-balance"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={openingBalance}
                                        onChange={(e) => setOpeningBalance(e.target.value)}
                                        className="pl-9"
                                        placeholder="0.00"
                                        required
                                    />
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Enter the starting cash amount in the register
                                </p>
                            </div>

                            <div className="bg-primary/10 dark:bg-orange-900/20 p-4 rounded-lg">
                                <p className="text-sm text-orange-800 dark:text-orange-200">
                                    <strong>Note:</strong> Make sure to count your starting cash carefully.
                                    This will be used to calculate variance when closing the till.
                                </p>
                            </div>

                            <div className="flex gap-3">
                                <Button
                                    type="submit"
                                    disabled={openMutation.isPending}
                                    className="flex-1"
                                >
                                    {openMutation.isPending ? 'Opening Till...' : 'Open Till'}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => router.back()}
                                    className="flex-1"
                                >
                                    Cancel
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </form>
            </div>
        </div>
    );
}
