"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { fixedAssetsApi, type FixedAsset } from "@/lib/api/fixed-assets";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    Plus,
    Search,
    TrendingDown,
    Package,
    DollarSign,
    ArrowLeft,
    Building2
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { DataTable } from "@/components/shared/DataTable";
import { format } from "date-fns";

export default function FixedAssetsListPage() {
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("active");
    const [categoryFilter, setCategoryFilter] = useState("");

    const { formatCurrency } = useCurrency();

    // Fetch stats
    const { data: stats } = useQuery({
        queryKey: ["fixed-assets", "dashboard-stats"],
        queryFn: () => fixedAssetsApi.dashboardStats(),
    });

    // Fetch assets
    const { data: assetsData, isLoading } = useQuery({
        queryKey: ["fixed-assets", statusFilter, categoryFilter],
        queryFn: () => fixedAssetsApi.list({
            status: statusFilter === "active" ? undefined : statusFilter,
            category: categoryFilter ? Number(categoryFilter) : undefined
        }),
    });

    // Fetch categories
    const { data: categories } = useQuery({
        queryKey: ["asset-categories"],
        queryFn: () => fixedAssetsApi.categories.active(),
    });

    const assets = assetsData?.results || assetsData || [];

    // Filter by search term
    const filteredAssets = assets.filter((asset: FixedAsset) =>
        asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.asset_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.category_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getStatusBadge = (status: string) => {
        const variants: Record<string, "success" | "secondary" | "danger" | "info" | "warning"> = {
            active: "success",
            inactive: "secondary",
            disposed: "danger",
            sold: "info",
            retired: "warning",
        };
        return variants[status] || "secondary";
    };

    const columns = [
        {
            header: "Asset #",
            accessor: "asset_number" as const,
            className: "w-28",
            cell: (asset: FixedAsset) => (
                <Link
                    href={`/fixed-assets/${asset.id}`}
                    className="font-mono text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline"
                >
                    {asset.asset_number}
                </Link>
            ),
        },
        {
            header: "Name",
            accessor: "name" as const,
            className: "min-w-[200px]",
            cell: (asset: FixedAsset) => (
                <div className="flex flex-col">
                    <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {asset.name}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        {asset.category_name}
                    </span>
                </div>
            ),
        },
        {
            header: "Branch",
            accessor: "branch_name" as const,
            className: "w-32",
            cell: (asset: FixedAsset) => (
                <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                    <Building2 className="w-3 h-3" />
                    <span>{asset.branch_name}</span>
                </div>
            ),
        },
        {
            header: "Acquisition",
            accessor: "acquisition_cost" as const,
            className: "w-32 text-right",
            cell: (asset: FixedAsset) => (
                <div className="flex flex-col items-end">
                    <span className="font-mono text-xs font-bold text-green-600 dark:text-green-400">
                        {formatCurrency(asset.acquisition_cost, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                        {format(new Date(asset.acquisition_date), "MMM yyyy")}
                    </span>
                </div>
            ),
        },
        {
            header: "Net Book Value",
            accessor: "net_book_value" as const,
            className: "w-32 text-right",
            cell: (asset: FixedAsset) => (
                <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                    {formatCurrency(asset.net_book_value, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
            ),
        },
        {
            header: "Depreciation",
            accessor: "accumulated_depreciation" as const,
            className: "w-32 text-right",
            cell: (asset: FixedAsset) => (
                <div className="flex flex-col items-end">
                    <span className="font-mono text-xs font-bold text-orange-600 dark:text-orange-400">
                        {formatCurrency(asset.accumulated_depreciation, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                        {asset.depreciation_percent.toFixed(1)}%
                    </span>
                </div>
            ),
        },
        {
            header: "Status",
            accessor: "status" as const,
            className: "w-24",
            cell: (asset: FixedAsset) => (
                <Badge variant={getStatusBadge(asset.status)} className="text-[10px] font-bold uppercase px-1.5 py-0.5">
                    {asset.status}
                </Badge>
            ),
        },
    ];

    return (
        <div className="flex-1 overflow-auto">
            <div className="p-4 sm:p-6 lg:p-6 max-w-[1800px] mx-auto space-y-4">
                {/* Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/dashboard">
                            <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                                <ArrowLeft className="w-4 h-4" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">
                                Fixed Assets
                            </h1>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                Track company assets and depreciation
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Link href="/fixed-assets/reports/valuation">
                            <Button variant="outline" size="sm" className="h-9 text-xs font-bold">
                                <TrendingDown className="mr-1.5 h-3.5 w-3.5" />
                                Valuation
                            </Button>
                        </Link>
                        <Link href="/fixed-assets/new">
                            <Button size="sm" className="h-9 text-xs font-bold">
                                <Plus className="mr-1.5 h-3.5 w-3.5" />
                                Add Asset
                            </Button>
                        </Link>
                    </div>
                </div>

                {/* Stats Grid */}
                {stats && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
                            <CardContent className="p-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                                            Total Assets
                                        </p>
                                        <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">
                                            {stats.total_assets}
                                        </p>
                                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                                            {stats.active_assets} active
                                        </p>
                                    </div>
                                    <div className="flex-shrink-0">
                                        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                                            <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
                            <CardContent className="p-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                                            Net Book Value
                                        </p>
                                        <p className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
                                            {formatCurrency(stats.total_net_book_value, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                        </p>
                                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                                            Current value
                                        </p>
                                    </div>
                                    <div className="flex-shrink-0">
                                        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                                            <TrendingDown className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
                            <CardContent className="p-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                                            Depreciation
                                        </p>
                                        <p className="text-2xl font-black text-orange-600 dark:text-orange-400 mt-1">
                                            {formatCurrency(stats.total_accumulated_depreciation, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                        </p>
                                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                                            {stats.avg_depreciation_percent.toFixed(1)}% avg
                                        </p>
                                    </div>
                                    <div className="flex-shrink-0">
                                        <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
                                            <TrendingDown className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                                            Total Investment
                                        </p>
                                        <p className="text-2xl font-black text-green-600 dark:text-green-400 mt-1">
                                            {formatCurrency(stats.total_acquisition_cost, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                        </p>
                                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                                            Original cost
                                        </p>
                                    </div>
                                    <div className="flex-shrink-0">
                                        <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                                            <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Toolbar */}
                <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
                    <CardContent className="p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <Input
                                    placeholder="Search by name, asset #, or category..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-9 h-9 text-sm"
                                />
                            </div>
                            <div className="flex gap-2">
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="h-9 px-3 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="active">Active</option>
                                    <option value="">All Statuses</option>
                                    <option value="inactive">Inactive</option>
                                    <option value="disposed">Disposed</option>
                                    <option value="sold">Sold</option>
                                    <option value="retired">Retired</option>
                                </select>
                                <select
                                    value={categoryFilter}
                                    onChange={(e) => setCategoryFilter(e.target.value)}
                                    className="h-9 px-3 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">All Categories</option>
                                    {categories?.map((cat) => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Data Table */}
                <DataTable
                    data={filteredAssets}
                    columns={columns}
                    isLoading={isLoading}
                    emptyMessage="No assets found"
                />
            </div>
        </div>
    );
}
