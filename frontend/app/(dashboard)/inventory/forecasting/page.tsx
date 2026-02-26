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
        <div className="space-y-6 pb-12">
            {/* Header */}
            <div className="flex flex-col space-y-4">
                <div className="flex justify-between items-center">
                    <div>
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
                            <Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link>
                            <span>/</span>
                            <Link href="/inventory" className="hover:text-primary transition-colors">Inventory</Link>
                            <span>/</span>
                            <span className="text-foreground font-medium">Forecasting</span>
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">
                            Parts Forecasting
                        </h1>
                    </div>
                    <Badge variant="outline" className="h-fit py-1 px-2 text-[10px] uppercase font-bold tracking-wide">
                        <TrendingUp className="mr-1 h-3 w-3" />
                        System Generated
                    </Badge>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {forecasts?.map((bundle) => (
                    <Card key={bundle.id} className="overflow-hidden border border-border shadow-sm hover:border-primary/50 transition-colors">
                        <CardHeader className="py-3 px-4 border-b bg-muted/30">
                            <div className="flex justify-between items-start">
                                <div>
                                    <CardTitle className="text-sm font-bold truncate max-w-[180px]">{bundle.name}</CardTitle>
                                    <CardDescription className="text-[10px] uppercase font-medium">{bundle.service_type || "Custom Bundle"}</CardDescription>
                                </div>
                                {bundle.bundles_available > 0 ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                ) : (
                                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4">
                            <div className="flex items-center justify-between pb-2 border-b">
                                <div className="space-y-0.5">
                                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Ready to Build</p>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-2xl font-black text-primary leading-none">
                                            {bundle.bundles_available}
                                        </span>
                                        <span className="text-xs font-medium text-muted-foreground">Units</span>
                                    </div>
                                </div>
                                <div className="h-10 w-10 rounded-full bg-primary/5 flex items-center justify-center">
                                    <Package className="h-5 w-5 text-primary/40" />
                                </div>
                            </div>

                            <div className="space-y-2.5">
                                <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                    Part Availability
                                </h4>

                                {bundle.part_breakdown.map((part: any, idx: number) => {
                                    const isCritical = part.potential_contribution === bundle.bundles_available;
                                    return (
                                        <div key={idx} className="space-y-1">
                                            <div className="flex justify-between text-[11px]">
                                                <span className="font-medium text-foreground truncate max-w-[140px]" title={part.part_name}>
                                                    {part.part_name}
                                                </span>
                                                <span className={`font-mono ${isCritical ? 'text-amber-600 font-bold' : 'text-muted-foreground'}`}>
                                                    {part.available_qty}/{part.required_qty}
                                                </span>
                                            </div>
                                            <Progress
                                                value={Math.min(100, (part.available_qty / part.required_qty) * 100)}
                                                className="h-1 bg-muted"
                                            />
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="pt-3 border-t flex justify-between items-center text-[11px] font-bold">
                                <Link
                                    href={`/inventory/bundles/${bundle.id}/edit`}
                                    className="text-primary hover:text-primary/80 flex items-center gap-1"
                                >
                                    Manage bundle <ArrowRight className="h-3 w-3" />
                                </Link>
                                {bundle.bundles_available < 5 && (
                                    <Link
                                        href="/inventory/purchase-orders/new"
                                        className="text-amber-600 hover:text-amber-700 uppercase tracking-tight"
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
