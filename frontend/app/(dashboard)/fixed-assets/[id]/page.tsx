"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fixedAssetsApi } from "@/lib/api/fixed-assets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Edit, Building2, Calendar, DollarSign, Tag, MapPin, Factory, Hash, Activity } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { format } from "date-fns";
import { use } from "react";

export default function AssetDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { id } = use(params);
    const assetId = parseInt(id);
    const { formatCurrency } = useCurrency();

    const { data: asset, isLoading } = useQuery({
        queryKey: ["fixed-asset", assetId],
        queryFn: () => fixedAssetsApi.get(assetId),
        enabled: !isNaN(assetId),
    });

    if (isLoading) {
        return <div className="p-6">Loading asset details...</div>;
    }

    if (!asset) {
        return <div className="p-6">Asset not found</div>;
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case "active":
                return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
            case "inactive":
                return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
            case "disposed":
            case "sold":
                return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
            case "retired":
                return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
            default:
                return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
        }
    };

    return (
        <div className="space-y-6 p-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <Link href="/fixed-assets">
                        <Button variant="secondary" size="sm">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back
                        </Button>
                    </Link>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">
                                {asset.name}
                            </h1>
                            <Badge className={getStatusColor(asset.status)} variant="outline">
                                {asset.status.toUpperCase()}
                            </Badge>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono">
                            {asset.asset_number}
                        </p>
                    </div>
                </div>
                <Link href={`/fixed-assets/${assetId}/edit`}>
                    <Button>
                        <Edit className="w-4 h-4 mr-2" />
                        Edit Asset
                    </Button>
                </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Main Info Card */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg font-semibold flex items-center">
                            <Activity className="w-5 h-5 mr-2" />
                            General Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-1">
                            <span className="text-sm font-medium text-gray-500">Asset Number</span>
                            <div className="flex items-center gap-2">
                                <Hash className="w-4 h-4 text-gray-400" />
                                <span className="font-mono">{asset.asset_number}</span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <span className="text-sm font-medium text-gray-500">Category</span>
                            <div className="flex items-center gap-2">
                                <Tag className="w-4 h-4 text-gray-400" />
                                <span>{asset.category_name || "N/A"}</span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <span className="text-sm font-medium text-gray-500">Branch</span>
                            <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-gray-400" />
                                <span>{asset.branch_name || "N/A"}</span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <span className="text-sm font-medium text-gray-500">Location</span>
                            <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-gray-400" />
                                <span>{asset.location || "Not specified"}</span>
                            </div>
                        </div>
                        {asset.description && (
                            <div className="col-span-1 sm:col-span-2 space-y-1 pt-2 border-t">
                                <span className="text-sm font-medium text-gray-500">Description</span>
                                <p className="text-sm text-gray-700 dark:text-gray-300">
                                    {asset.description}
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Financials Card */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg font-semibold flex items-center">
                            <DollarSign className="w-5 h-5 mr-2" />
                            Financial Details
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between items-center py-2 border-b">
                            <span className="text-sm text-gray-500">Acquisition Cost</span>
                            <span className="font-semibold">{formatCurrency(asset.acquisition_cost)}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                            <span className="text-sm text-gray-500">Salvage Value</span>
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                                {formatCurrency(asset.salvage_value || 0)}
                            </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                            <span className="text-sm text-gray-500">Acquisition Date</span>
                            <span className="flex items-center gap-1.5 status-text">
                                <Calendar className="w-3.5 h-3.5" />
                                {format(new Date(asset.acquisition_date), "MMM d, yyyy")}
                            </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                            <span className="text-sm text-gray-500">Useful Life</span>
                            <span>{asset.useful_life_years} Years</span>
                        </div>
                        <div className="flex justify-between items-center py-2">
                            <span className="text-sm text-gray-500">Depreciation Method</span>
                            <span className="capitalize">{asset.depreciation_method.replace(/_/g, " ")}</span>
                        </div>
                    </CardContent>
                </Card>

                {/* Technical Details Card */}
                <Card className="md:col-span-3">
                    <CardHeader>
                        <CardTitle className="text-lg font-semibold flex items-center">
                            <Factory className="w-5 h-5 mr-2" />
                            Technical Specifications
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <div className="space-y-1">
                            <span className="text-sm font-medium text-gray-500">Manufacturer</span>
                            <p>{asset.manufacturer || "N/A"}</p>
                        </div>
                        <div className="space-y-1">
                            <span className="text-sm font-medium text-gray-500">Model Number</span>
                            <p className="font-mono text-sm">{asset.model_number || "N/A"}</p>
                        </div>
                        <div className="space-y-1">
                            <span className="text-sm font-medium text-gray-500">Serial Number</span>
                            <p className="font-mono text-sm">{asset.serial_number || "N/A"}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
