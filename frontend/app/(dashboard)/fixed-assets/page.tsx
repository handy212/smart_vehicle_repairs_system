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
    Building2,
    User
} from "lucide-react";
import { useState } from "react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { cn } from "@/lib/utils";
import { DataTable } from "@/components/shared/DataTable";
import { format } from "date-fns";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { PermissionButton } from "@/components/auth/PermissionButton";

export default function FixedAssetsListPage() {
    return (
        <PermissionGuard permission="view_assets">
            <FixedAssetsContent />
        </PermissionGuard>
    );
}

function FixedAssetsContent() {
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
                    className="font-mono text-xs font-bold text-primary hover:text-primary hover:underline"
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
                    <span className="font-medium text-sm text-foreground">
                        {asset.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
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
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
                    <span className="font-mono text-xs font-bold text-success">
                        {formatCurrency(asset.acquisition_cost, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
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
                <span className="font-mono text-xs font-bold text-primary">
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
                    <span className="font-mono text-xs font-bold text-primary">
                        {formatCurrency(asset.accumulated_depreciation, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                        {asset.depreciation_percent.toFixed(1)}%
                    </span>
                </div>
            ),
        },
        {
            header: "Assigned To",
            accessor: "assigned_to_name" as const,
            className: "w-40",
            cell: (asset: FixedAsset) => (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
                    <User className="w-3.5 h-3.5" />
                    <span className="truncate max-w-[140px] font-medium">
                        {asset.assigned_to_name || "Unassigned"}
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
                            <h1 className="text-2xl font-black tracking-tight text-foreground">
                                Fixed Assets
                            </h1>
                            <p className="text-xs text-muted-foreground mt-0.5">
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
                            <PermissionButton size="sm" className="h-9 text-xs font-bold" permission="create_assets">
                                <Plus className="mr-1.5 h-3.5 w-3.5" />
                                Add Asset
                            </PermissionButton>
                        </Link>
                    </div>
                </div>

                {/* Stats Grid */}
                {stats && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <Card className="border-border shadow-sm">
                            <CardContent className="p-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                            Total Assets
                                        </p>
                                        <p className="text-2xl font-black text-foreground mt-1">
                                            {stats.total_assets}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground mt-1">
                                            {stats.active_assets} active
                                        </p>
                                    </div>
                                    <div className="flex-shrink-0">
                                        <div className="w-10 h-10 rounded-lg bg-primary/10 dark:bg-orange-900/20 flex items-center justify-center">
                                            <Package className="w-5 h-5 text-primary" />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-border shadow-sm">
                            <CardContent className="p-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                            Net Book Value
                                        </p>
                                        <p className="text-2xl font-black text-primary mt-1">
                                            {formatCurrency(stats.total_net_book_value, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground mt-1">
                                            Current value
                                        </p>
                                    </div>
                                    <div className="flex-shrink-0">
                                        <div className="w-10 h-10 rounded-lg bg-primary/10 dark:bg-orange-900/20 flex items-center justify-center">
                                            <TrendingDown className="w-5 h-5 text-primary" />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-border shadow-sm">
                            <CardContent className="p-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                            Depreciation
                                        </p>
                                        <p className="text-2xl font-black text-primary mt-1">
                                            {formatCurrency(stats.total_accumulated_depreciation, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground mt-1">
                                            {stats.avg_depreciation_percent.toFixed(1)}% avg
                                        </p>
                                    </div>
                                    <div className="flex-shrink-0">
                                        <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
                                            <TrendingDown className="w-5 h-5 text-primary" />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-border shadow-sm">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                            Total Investment
                                        </p>
                                        <p className="text-2xl font-black text-success mt-1">
                                            {formatCurrency(stats.total_acquisition_cost, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground mt-1">
                                            Original cost
                                        </p>
                                    </div>
                                    <div className="flex-shrink-0">
                                        <div className="w-10 h-10 rounded-lg bg-success/10 dark:bg-green-900/20 flex items-center justify-center">
                                            <DollarSign className="w-5 h-5 text-success" />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Toolbar */}
                <Card className="border-border shadow-sm">
                    <CardContent className="p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
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
                                    className="h-9 px-3 text-xs font-medium rounded-lg border border-border bg-card bg-background focus:outline-none focus:ring-2 focus:ring-primary"
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
                                    className="h-9 px-3 text-xs font-medium rounded-lg border border-border bg-card bg-background focus:outline-none focus:ring-2 focus:ring-primary"
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
