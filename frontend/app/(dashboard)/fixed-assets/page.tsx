"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Download, TrendingDown, Package } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Asset {
    id: number;
    asset_number: string;
    name: string;
    category: number;
    category_name: string;
    acquisition_cost: number;
    acquisition_date: string;
    depreciation_method: string;
    useful_life_years: number;
    accumulated_depreciation: number;
    net_book_value: number;
    depreciation_percent: number;
    status: string;
    branch: number;
    branch_name: string;
    last_depreciation_date: string | null;
    created_at: string;
}

export default function FixedAssetsListPage() {
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("active");
    const [categoryFilter, setCategoryFilter] = useState("");

    const { data: assets, isLoading, refetch } = useQuery<Asset[]>({
        queryKey: ['fixed-assets', statusFilter, categoryFilter],
        queryFn: async () => {
            let url = '/api/fixed-assets/assets/';
            if (statusFilter === 'active') {
                url = '/api/fixed-assets/assets/active/';
            }
            const params = new URLSearchParams();
            if (statusFilter && statusFilter !== 'active') {
                params.append('status', statusFilter);
            }
            if (categoryFilter) {
                params.append('category', categoryFilter);
            }
            const response = await axios.get(url + (params.toString() ? `?${params.toString()}` : ''));
            return response.data.results || response.data;
        },
    });

    const { data: categories } = useQuery({
        queryKey: ['asset-categories'],
        queryFn: async () => {
            const response = await axios.get('/api/fixed-assets/categories/active/');
            return response.data;
        },
    });

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    const getStatusBadge = (status: string) => {
        const statusColors: Record<string, string> = {
            active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
            inactive: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
            disposed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
            sold: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
            retired: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
        };

        return (
            <Badge className={statusColors[status] || statusColors.inactive}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
        );
    };

    const getDepreciationMethodBadge = (method: string) => {
        const methodLabels: Record<string, string> = {
            straight_line: 'Straight Line',
            declining_balance: 'Declining Balance',
            units_of_production: 'Units of Production',
            none: 'No Depreciation',
        };

        return (
            <span className="text-sm text-muted-foreground">
                {methodLabels[method] || method}
            </span>
        );
    };

    const filteredAssets = assets?.filter((asset) =>
        asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.asset_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.category_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Calculate summary statistics
    const totalAssets = filteredAssets?.length || 0;
    const totalValue = filteredAssets?.reduce((sum, asset) => sum + asset.net_book_value, 0) || 0;
    const totalDepreciation = filteredAssets?.reduce((sum, asset) => sum + asset.accumulated_depreciation, 0) || 0;
    const totalCost = filteredAssets?.reduce((sum, asset) => sum + asset.acquisition_cost, 0) || 0;

    if (isLoading) {
        return (
            <div className="p-8 space-y-6">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-96 w-full" />
            </div>
        );
    }

    return (
        <div className="p-8 space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Fixed Assets</h1>
                    <p className="text-muted-foreground mt-1">
                        Manage company assets, track depreciation, and view valuations
                    </p>
                </div>
                <div className="flex gap-2">
                    <Link href="/fixed-assets/reports/valuation">
                        <Button variant="outline">
                            <TrendingDown className="mr-2 h-4 w-4" />
                            Valuation Report
                        </Button>
                    </Link>
                    <Link href="/fixed-assets/new">
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Asset
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalAssets}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Active and tracked
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Net Book Value</CardTitle>
                        <TrendingDown className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600">
                            {formatCurrency(totalValue)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Current value
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Depreciation</CardTitle>
                        <TrendingDown className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-600">
                            {formatCurrency(totalDepreciation)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Accumulated
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Original Cost</CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">
                            {formatCurrency(totalCost)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Total investment
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-2">
                            <Label htmlFor="search">Search Assets</Label>
                            <div className="relative mt-1">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <Input
                                    id="search"
                                    placeholder="Search by name, number, or category..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="status">Status</Label>
                            <select
                                id="status"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="mt-1 w-full p-2 border rounded-md"
                            >
                                <option value="active">Active</option>
                                <option value="">All</option>
                                <option value="inactive">Inactive</option>
                                <option value="disposed">Disposed</option>
                                <option value="sold">Sold</option>
                                <option value="retired">Retired</option>
                            </select>
                        </div>

                        <div>
                            <Label htmlFor="category">Category</Label>
                            <select
                                id="category"
                                value={categoryFilter}
                                onChange={(e) => setCategoryFilter(e.target.value)}
                                className="mt-1 w-full p-2 border rounded-md"
                            >
                                <option value="">All Categories</option>
                                {categories?.map((cat: any) => (
                                    <option key={cat.id} value={cat.id}>
                                        {cat.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Assets Table */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Assets ({filteredAssets?.length || 0})</CardTitle>
                        <Button variant="outline" size="sm">
                            <Download className="mr-2 h-4 w-4" />
                            Export
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {filteredAssets && filteredAssets.length > 0 ? (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Asset #</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Category</TableHead>
                                        <TableHead className="text-right">Acquisition Cost</TableHead>
                                        <TableHead className="text-right">Net Book Value</TableHead>
                                        <TableHead className="text-right">Depreciation</TableHead>
                                        <TableHead>Method</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Branch</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredAssets.map((asset) => (
                                        <TableRow key={asset.id}>
                                            <TableCell className="font-medium">
                                                <Link
                                                    href={`/fixed-assets/${asset.id}`}
                                                    className="text-blue-600 hover:underline"
                                                >
                                                    {asset.asset_number}
                                                </Link>
                                            </TableCell>
                                            <TableCell>{asset.name}</TableCell>
                                            <TableCell>{asset.category_name}</TableCell>
                                            <TableCell className="text-right font-mono text-green-600">
                                                {formatCurrency(asset.acquisition_cost)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-blue-600">
                                                {formatCurrency(asset.net_book_value)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex flex-col items-end">
                                                    <span className="font-mono text-sm text-orange-600">
                                                        {formatCurrency(asset.accumulated_depreciation)}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {asset.depreciation_percent.toFixed(1)}%
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {getDepreciationMethodBadge(asset.depreciation_method)}
                                            </TableCell>
                                            <TableCell>{getStatusBadge(asset.status)}</TableCell>
                                            <TableCell className="text-sm">{asset.branch_name}</TableCell>
                                            <TableCell className="text-right">
                                                <Link href={`/fixed-assets/${asset.id}`}>
                                                    <Button variant="ghost" size="sm">
                                                        View
                                                    </Button>
                                                </Link>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground">
                            <Package className="mx-auto h-12 w-12 mb-4 text-gray-400" />
                            <p className="text-lg font-medium">No assets found</p>
                            <p className="text-sm mt-1">Get started by adding your first asset</p>
                            <Link href="/fixed-assets/new">
                                <Button className="mt-4">
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add First Asset
                                </Button>
                            </Link>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
