"use client";

import { useQuery } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api/inventory";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Eye, MoreVertical, ArrowRightLeft, MapPin, Calendar, Truck, X, Download, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { AdvancedFilters, FilterOption } from "@/components/ui/advanced-filters";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/lib/hooks/useToast";

export default function TransfersPage() {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState("");
    // * eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const [advancedFilters, setAdvancedFilters] = useState<Record<string, any>>({});
    const [page, setPage] = useState(1);
    const { toast } = useToast();

    const { data, isLoading } = useQuery({
        queryKey: ["transfers", page, searchQuery, advancedFilters],
        queryFn: () =>
            inventoryApi.listTransfers({
                page,
                search: searchQuery || undefined,
                status: advancedFilters.status || undefined,
                source_branch: advancedFilters.source_branch || undefined,
                destination_branch: advancedFilters.destination_branch || undefined,
            }),
    });

    const transfers = Array.isArray(data) ? data : data?.results || [];

    const handleExport = () => {
        toast({ title: "Export", description: "Export functionality coming soon" });
    };

    const getStatusVariant = (status: string) => {
        switch (status) {
            case "draft": return "secondary";
            case "pending_approval": return "warning";
            case "requested": return "warning";
            case "approved": return "info";
            case "in_transit": return "primary";
            case "received": return "success";
            case "rejected": return "danger";
            case "cancelled": return "secondary";
            default: return "default";
        }
    };

    const getStatusLabel = (status: string) => {
        return status.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
    };

    const filterOptions: FilterOption[] = [
        {
            key: "status",
            label: "Status",
            type: "select",
            options: [
                { value: "draft", label: "Draft" },
                { value: "pending_approval", label: "Pending Approval" },
                { value: "requested", label: "Requested" },
                { value: "approved", label: "Approved" },
                { value: "in_transit", label: "In Transit" },
                { value: "received", label: "Received" },
                { value: "rejected", label: "Rejected" },
                { value: "cancelled", label: "Cancelled" },
            ],
        },
        // Filters for Source/Dest branches could be added here if we fetch branch list
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col space-y-4">
                <div className="flex justify-between items-center pt-2">
                    <div>
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
                            <Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link>
                            <span>/</span>
                            <Link href="/inventory" className="hover:text-primary transition-colors">Inventory</Link>
                            <span>/</span>
                            <span className="text-foreground font-medium">Transfers</span>
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">
                            Inter-Branch Transfers
                        </h1>
                    </div>
                </div>
            </div>

            {/* Unified Toolbar */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card/50 p-1 rounded-lg">
                <div className="flex items-center gap-2 flex-1 w-full md:w-auto">
                    {/* Search */}
                    <div className="relative flex-1 md:flex-none md:w-64">
                        <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                        <Input
                            type="text"
                            placeholder="Search transfers..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setPage(1);
                            }}
                            className="pl-9 h-9 text-sm bg-muted border-none focus:ring-1 transition-all"
                        />
                    </div>

                    {/* Advanced Filters */}
                    <AdvancedFilters
                        filters={filterOptions}
                        activeFilters={advancedFilters}
                        onFiltersChange={(filters) => {
                            setAdvancedFilters(filters);
                            setPage(1);
                        }}
                        onClear={() => {
                            setAdvancedFilters({});
                            setPage(1);
                        }}
                        title="Filter Transfers"
                    />

                    {/* Clear Filters (Icon only) */}
                    {(searchQuery || Object.keys(advancedFilters).length > 0) && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setSearchQuery("");
                                setAdvancedFilters({});
                                setPage(1);
                            }}
                            className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive"
                            title="Clear all filters"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    )}

                    {/* Active Filter Badges */}
                    <div className="hidden lg:flex flex-wrap items-center gap-1.5 ml-2">
                        {Object.entries(advancedFilters).map(([key, value]) => {
                            if (!value || (typeof value === 'string' && value === '')) return null;
                            let displayLabel = key;
                            let displayValue = String(value);

                            const filter = filterOptions.find((f) => f.key === key);
                            if (filter) {
                                displayLabel = filter.label;
                                if (filter.type === 'select') {
                                    const option = filter.options?.find(o => o.value === String(value));
                                    if (option) displayValue = option.label;
                                }
                            }

                            return (
                                <Badge key={key} variant="secondary" className="text-[10px] px-1.5 h-6 flex items-center gap-1 bg-border text-muted-foreground font-normal">
                                    {displayLabel}: {displayValue}
                                    <X
                                        className="w-3 h-3 cursor-pointer hover:text-destructive"
                                        onClick={() => {
                                            const newFilters = { ...advancedFilters };
                                            delete newFilters[key];
                                            setAdvancedFilters(newFilters);
                                            setPage(1);
                                        }}
                                    />
                                </Badge>
                            );
                        })}
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-9 bg-card">
                                Actions
                                <ChevronDown className="w-3.5 h-3.5 ml-2" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={handleExport}>
                                <Download className="w-4 h-4 mr-2" />
                                Export CSV
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <Link href="/inventory/transfers/new">
                        <Button size="sm" className="h-9 bg-primary hover:bg-primary/90 text-white shadow-sm">
                            <Plus className="w-4 h-4 mr-2" />
                            New Transfer
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Transfers Table */}
            <Card className="border-none shadow-sm overflow-hidden ring-1 ring-gray-200 dark:ring-gray-800">
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-6"><TableSkeleton rows={8} columns={6} /></div>
                    ) : transfers.length > 0 ? (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/50 border-y border-border">
                                    <TableRow className="hover:bg-transparent border-none">
                                        <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Transfer #</TableHead>
                                        <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Source & Destination</TableHead>
                                        <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Requested Date</TableHead>
                                        <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Status</TableHead>
                                        <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-right">Items</TableHead>
                                        <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>

                                    {transfers.map((transfer: any) => (
                                        <TableRow
                                            key={transfer.id}
                                            className="group hover:bg-muted/50 hover:bg-muted/50 border-b border-border cursor-pointer transition-colors"
                                            onClick={() => router.push(`/inventory/transfers/${transfer.id}`)}
                                        >
                                            <TableCell className="px-4 py-2 font-mono text-xs font-medium text-card-foreground">
                                                {transfer.transfer_number}
                                            </TableCell>
                                            <TableCell className="px-4 py-2">
                                                <div className="flex flex-col text-sm">
                                                    <div className="flex items-center text-foreground font-medium">
                                                        <MapPin className="w-3 h-3 mr-1.5 text-primary" />
                                                        {transfer.source_branch_name || "Unknown"}
                                                    </div>
                                                    <div className="flex items-center text-muted-foreground text-xs mt-0.5 ml-4">
                                                        <ArrowRightLeft className="w-3 h-3 mr-1.5" />
                                                        To: {transfer.destination_branch_name || "Unknown"}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-xs text-muted-foreground">
                                                <div className="flex items-center">
                                                    <Calendar className="w-3 h-3 mr-1.5" />
                                                    {transfer.requested_date
                                                        ? format(new Date(transfer.requested_date), "MMM dd, yyyy")
                                                        : "-"}
                                                </div>
                                            </TableCell>
                                            <TableCell className="px-4 py-2">

                                                <Badge variant={getStatusVariant(transfer.status) as any} className="text-[10px] px-2 py-0 border shadow-none bg-transparent capitalize">
                                                    {getStatusLabel(transfer.status)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="px-4 py-2 font-mono text-xs text-foreground text-right">
                                                {transfer.items?.length || 0}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 w-7 p-0 hover:bg-muted text-muted-foreground"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <MoreVertical className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
                                                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem onClick={() => router.push(`/inventory/transfers/${transfer.id}`)}>
                                                            <Eye className="w-4 h-4 mr-2" />
                                                            View Details
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <Truck className="w-12 h-12 text-gray-300 text-muted-foreground mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-foreground">No transfers found</h3>
                            <p className="text-muted-foreground max-w-sm mx-auto mt-1 mb-4">
                                Get started by initiating a new stock transfer.
                            </p>
                            <Link href="/inventory/transfers/new">
                                <Button variant="outline" size="sm">
                                    <Plus className="w-3.5 h-3.5 mr-2" />
                                    New Transfer
                                </Button>
                            </Link>
                        </div>
                    )}

                    {/* Pagination */}
                    {!Array.isArray(data) && data && data.count > 0 && (
                        <div className="p-3 border-t border-border flex items-center justify-between bg-muted/30">
                            <div className="text-xs text-muted-foreground">
                                Showing {((page - 1) * 10) + 1} to {Math.min(page * 10, data.count)} of {data.count}
                            </div>
                            <div className="flex space-x-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={!data.previous}
                                    className="h-7 text-xs bg-card"
                                >
                                    Previous
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => p + 1)}
                                    disabled={!data.next}
                                    className="h-7 text-xs bg-card"
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
