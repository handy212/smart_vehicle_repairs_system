"use client";

import { useQuery } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api/inventory";
import { useBranchStore } from "@/store/branchStore";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
    BarChart3,
    AlertTriangle,
    CheckCircle2,
    Package,
    ArrowRight,
    TrendingUp
} from "lucide-react";
import Link from "next/link";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export default function ForecastingPage() {
    const { activeBranchId } = useBranchStore();

    const { data: forecasts, isLoading, error } = useQuery({
        queryKey: ["inventory", "forecast", activeBranchId],
        queryFn: () => inventoryApi.getBundleForecast(activeBranchId!),
        enabled: !!activeBranchId,
    });

    if (!activeBranchId) {
        return (
            <div className="p-6">
                <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Branch Required</AlertTitle>
                    <AlertDescription>
                        Please select a branch to view inventory forecasting.
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    if (isLoading) {
        return <div className="p-6 animate-pulse">Loading forecasting data...</div>;
    }

    if (error) {
        return (
            <div className="p-6 text-red-500">
                Error loading forecasting data. Please try again later.
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Parts Forecasting</h1>
                    <p className="text-muted-foreground">
                        Bundle availability based on current branch stock levels.
                    </p>
                </div>
                <Badge variant="outline" className="h-fit">
                    <TrendingUp className="mr-1 h-3 w-3" />
                    System Generated
                </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {forecasts?.map((bundle) => (
                    <Card key={bundle.id} className="overflow-hidden border-2 transition-all hover:border-primary/50">
                        <CardHeader className="bg-muted/30 pb-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <CardTitle className="text-xl">{bundle.name}</CardTitle>
                                    <CardDescription>{bundle.service_type || "Custom Bundle"}</CardDescription>
                                </div>
                                {bundle.bundles_available > 0 ? (
                                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                                ) : (
                                    <AlertTriangle className="h-6 w-6 text-amber-500" />
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <div className="text-center py-4">
                                <span className="text-5xl font-black text-primary">
                                    {bundle.bundles_available}
                                </span>
                                <p className="text-sm font-medium text-muted-foreground mt-2">
                                    Full Bundles Ready
                                </p>
                            </div>

                            <div className="space-y-3">
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center">
                                    <Package className="mr-2 h-3 w-3" />
                                    Part Breakdown
                                </h4>
                                {bundle.part_breakdown.map((part: any, idx: number) => {
                                    const isCritical = part.potential_contribution === bundle.bundles_available;
                                    return (
                                        <div key={idx} className="space-y-1">
                                            <div className="flex justify-between text-sm">
                                                <span className="font-medium truncate max-w-[150px]" title={part.part_name}>
                                                    {part.part_name}
                                                </span>
                                                <span className={`font-mono text-xs ${isCritical ? 'text-amber-600 font-bold' : 'text-muted-foreground'}`}>
                                                    {part.available_qty}/{part.required_qty}
                                                </span>
                                            </div>
                                            <Progress
                                                value={Math.min(100, (part.available_qty / part.required_qty) * 100)}
                                                className="h-1"
                                                style={{ '--progress-foreground': isCritical ? '#f59e0b' : '#3b82f6' } as any}
                                            />
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="pt-4 mt-2 border-t flex justify-between items-center text-sm font-medium">
                                <Link
                                    href={`/inventory/bundles/${bundle.id}/edit`}
                                    className="text-primary hover:underline inline-flex items-center"
                                >
                                    Edit Bundle <ArrowRight className="ml-1 h-3 w-3" />
                                </Link>
                                {bundle.bundles_available < 5 && (
                                    <Link
                                        href="/inventory/purchase-orders/new"
                                        className="text-amber-600 hover:text-amber-700 font-bold"
                                    >
                                        Restock
                                    </Link>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {forecasts?.length === 0 && (
                <Alert>
                    <Package className="h-4 w-4" />
                    <AlertTitle>No Active Bundles</AlertTitle>
                    <AlertDescription>
                        You haven't created any active service bundles yet.
                        Go to <Link href="/inventory/bundles" className="underline">Service Bundles</Link> to get started.
                    </AlertDescription>
                </Alert>
            )}
        </div>
    );
}
