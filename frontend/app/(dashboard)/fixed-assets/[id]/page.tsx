"use client";

import { useQuery } from "@tanstack/react-query";
import { fixedAssetsApi } from "@/lib/api/fixed-assets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Edit, Building2, Calendar, DollarSign, Tag, MapPin, Factory, Hash, Activity, User } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { format } from "date-fns";
import { use } from "react";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { PermissionButton } from "@/components/auth/PermissionButton";

export default function AssetDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    return (
        <PermissionGuard permission="view_assets">
            <AssetDetailsContent params={params} />
        </PermissionGuard>
    );
}

function AssetDetailsContent({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const assetId = parseInt(id);
    const { formatCurrency } = useCurrency();

    const { data: asset, isLoading } = useQuery({
        queryKey: ["fixed-asset", assetId],
        queryFn: () => fixedAssetsApi.get(assetId),
        enabled: !isNaN(assetId),
    });

    if (isLoading) {
        return <div className="text-sm text-muted-foreground">Loading asset details...</div>;
    }

    if (!asset) {
        return <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">Asset not found</div>;
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case "active":
                return "border-success/25 bg-success/10 text-success";
            case "inactive":
                return "border-border bg-muted text-muted-foreground";
            case "disposed":
            case "sold":
                return "border-destructive/20 bg-destructive/10 text-destructive";
            case "retired":
                return "border-warning/25 bg-warning/10 text-warning-foreground";
            default:
                return "border-border bg-muted text-muted-foreground";
        }
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                    <Link href="/fixed-assets">
                        <Button variant="ghost" size="sm">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back
                        </Button>
                    </Link>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-xl font-semibold tracking-tight text-foreground">
                                {asset.name}
                            </h1>
                            <Badge className={getStatusColor(asset.status)} variant="outline">
                                {asset.status.toUpperCase()}
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                            {asset.asset_number}
                        </p>
                    </div>
                </div>
                <Link href={`/fixed-assets/${assetId}/edit`}>
                    <PermissionButton permission="edit_assets">
                        <Edit className="w-4 h-4 mr-2" />
                        Edit Asset
                    </PermissionButton>
                </Link>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {/* Main Info Card */}
                <Card className="md:col-span-2">
                    <CardHeader className="px-4 py-3">
                        <CardTitle className="flex items-center text-sm font-semibold">
                            <Activity className="mr-2 h-4 w-4" />
                            General Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-4 px-4 pb-4 sm:grid-cols-2">
                        <div className="space-y-1">
                            <span className="text-xs font-medium text-muted-foreground">Asset Number</span>
                            <div className="flex items-center gap-2">
                                <Hash className="h-4 w-4 text-muted-foreground" />
                                <span className="font-mono text-sm">{asset.asset_number}</span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <span className="text-xs font-medium text-muted-foreground">Category</span>
                            <div className="flex items-center gap-2">
                                <Tag className="w-4 h-4 text-muted-foreground" />
                                <span>{asset.category_name || "N/A"}</span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <span className="text-xs font-medium text-muted-foreground">Branch</span>
                            <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-muted-foreground" />
                                <span>{asset.branch_name || "N/A"}</span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <span className="text-xs font-medium text-muted-foreground">Location</span>
                            <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-muted-foreground" />
                                <span>{asset.location || "Not specified"}</span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <span className="text-xs font-medium text-muted-foreground">Assigned To</span>
                            <div className="flex items-center gap-2">
                                <User className="w-4 h-4 text-muted-foreground" />
                                <span>{asset.assigned_to_name || "Unassigned"}</span>
                            </div>
                        </div>
                        {asset.description && (
                            <div className="col-span-1 sm:col-span-2 space-y-1 pt-2 border-t">
                                <span className="text-xs font-medium text-muted-foreground">Description</span>
                                <p className="text-sm text-card-foreground">
                                    {asset.description}
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Financials Card */}
                <Card>
                    <CardHeader className="px-4 py-3">
                        <CardTitle className="flex items-center text-sm font-semibold">
                            <DollarSign className="mr-2 h-4 w-4" />
                            Financial Details
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 px-4 pb-4">
                        <div className="flex items-center justify-between border-b py-2">
                            <span className="text-sm text-muted-foreground">Acquisition Cost</span>
                            <span className="font-semibold">{formatCurrency(asset.acquisition_cost)}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                            <span className="text-sm text-muted-foreground">Salvage Value</span>
                            <span className="font-medium text-card-foreground">
                                {formatCurrency(asset.salvage_value || 0)}
                            </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                            <span className="text-sm text-muted-foreground">Acquisition Date</span>
                            <span className="flex items-center gap-1.5 status-text">
                                <Calendar className="w-3.5 h-3.5" />
                                {format(new Date(asset.acquisition_date), "MMM d, yyyy")}
                            </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                            <span className="text-sm text-muted-foreground">Useful Life</span>
                            <span>{asset.useful_life_years} Years</span>
                        </div>
                        <div className="flex justify-between items-center py-2">
                            <span className="text-sm text-muted-foreground">Depreciation Method</span>
                            <span className="capitalize">{asset.depreciation_method.replace(/_/g, " ")}</span>
                        </div>
                    </CardContent>
                </Card>

                {/* Technical Details Card */}
                <Card className="md:col-span-3">
                    <CardHeader className="px-4 py-3">
                        <CardTitle className="flex items-center text-sm font-semibold">
                            <Factory className="mr-2 h-4 w-4" />
                            Technical Specifications
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-4 px-4 pb-4 sm:grid-cols-3">
                        <div className="space-y-1">
                            <span className="text-sm font-medium text-muted-foreground">Manufacturer</span>
                            <p>{asset.manufacturer || "N/A"}</p>
                        </div>
                        <div className="space-y-1">
                            <span className="text-sm font-medium text-muted-foreground">Model Number</span>
                            <p className="font-mono text-sm">{asset.model_number || "N/A"}</p>
                        </div>
                        <div className="space-y-1">
                            <span className="text-sm font-medium text-muted-foreground">Serial Number</span>
                            <p className="font-mono text-sm">{asset.serial_number || "N/A"}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
