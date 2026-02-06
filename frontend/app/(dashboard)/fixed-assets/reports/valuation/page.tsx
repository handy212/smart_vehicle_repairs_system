"use client";

import { useQuery } from "@tanstack/react-query";
import { fixedAssetsApi, type FixedAsset } from "@/lib/api/fixed-assets";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/shared/DataTable";
import { ArrowLeft, Printer, TrendingDown, DollarSign } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

export default function AssetValuationReportPage() {
    const { formatCurrency } = useCurrency();

    // Fetch stats for the summary cards
    const { data: stats } = useQuery({
        queryKey: ["fixed-assets", "dashboard-stats"],
        queryFn: () => fixedAssetsApi.dashboardStats(),
    });

    // Fetch all assets for the table
    // In a real large app we might want a specialized report endpoint, but list is fine for now
    const { data: assetsData, isLoading } = useQuery({
        queryKey: ["fixed-assets", "report", "valuation"],
        queryFn: () => fixedAssetsApi.list({ status: "active" }), // Typically valuation is for active assets
    });

    const assets = assetsData?.results || assetsData || [];

    const handlePrint = () => {
        window.print();
    };

    const columns = [
        {
            header: "Asset #",
            accessor: "asset_number" as const,
            className: "w-28",
            cell: (asset: FixedAsset) => (
                <span className="font-mono text-xs font-bold">{asset.asset_number}</span>
            ),
        },
        {
            header: "Asset Name",
            accessor: "name" as const,
            className: "min-w-[200px]",
            cell: (asset: FixedAsset) => (
                <div className="flex flex-col">
                    <span className="font-medium text-sm">{asset.name}</span>
                    <span className="text-xs text-muted-foreground">{asset.category_name}</span>
                </div>
            ),
        },
        {
            header: "Acquisition Date",
            accessor: "acquisition_date" as const,
            className: "w-36",
            cell: (asset: FixedAsset) => (
                <span className="text-sm">
                    {format(new Date(asset.acquisition_date), "MMM dd, yyyy")}
                </span>
            ),
        },
        {
            header: "Cost",
            accessor: "acquisition_cost" as const,
            className: "w-32 text-right",
            cell: (asset: FixedAsset) => (
                <div className="text-right font-mono text-sm">
                    {formatCurrency(asset.acquisition_cost)}
                </div>
            ),
        },
        {
            header: "Depreciation",
            accessor: "accumulated_depreciation" as const,
            className: "w-32 text-right",
            cell: (asset: FixedAsset) => (
                <div className="text-right font-mono text-sm text-primary">
                    {formatCurrency(asset.accumulated_depreciation)}
                </div>
            ),
        },
        {
            header: "Net Book Value",
            accessor: "net_book_value" as const,
            className: "w-36 text-right",
            cell: (asset: FixedAsset) => (
                <div className="text-right font-mono text-sm font-bold text-primary">
                    {formatCurrency(asset.net_book_value)}
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6 p-6 max-w-[1800px] mx-auto print:p-0 print:max-w-none">
            <div className="flex items-center justify-between print:hidden">
                <div className="flex items-center gap-4">
                    <Link href="/fixed-assets">
                        <Button variant="outline" size="sm">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight text-foreground">
                            Asset Valuation Report
                        </h1>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Financial summary of active fixed assets
                        </p>
                    </div>
                </div>
                <Button onClick={handlePrint} variant="outline">
                    <Printer className="w-4 h-4 mr-2" />
                    Print Report
                </Button>
            </div>

            {/* Print Header */}
            <div className="hidden print:block mb-8">
                <h1 className="text-2xl font-bold mb-2">Fixed Asset Valuation Report</h1>
                <p className="text-sm text-gray-500">Generated on {format(new Date(), "PPP")}</p>
            </div>

            {/* Summary Cards */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:grid-cols-3 print:gap-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total Investment</CardTitle>
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {formatCurrency(stats.total_acquisition_cost, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </div>
                            <p className="text-xs text-muted-foreground">Original acquisition cost</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Accumulated Depreciation</CardTitle>
                            <TrendingDown className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-primary">
                                {formatCurrency(stats.total_accumulated_depreciation, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </div>
                            <p className="text-xs text-muted-foreground">Total value lost to usage</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Net Book Value</CardTitle>
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-primary">
                                {formatCurrency(stats.total_net_book_value, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </div>
                            <p className="text-xs text-muted-foreground">Current asset value</p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Asset Table */}
            <Card className="print:border-0 print:shadow-none">
                <CardHeader className="print:hidden">
                    <CardTitle>Asset Details</CardTitle>
                </CardHeader>
                <CardContent className="p-0 print:p-0">
                    <DataTable
                        data={assets}
                        columns={columns}
                        isLoading={isLoading}
                        emptyMessage="No assets found"
                    />
                </CardContent>
            </Card>
        </div>
    );
}
