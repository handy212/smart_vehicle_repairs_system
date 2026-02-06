"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { workordersApi, WorkOrderPart } from "@/lib/api/workorders";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowRight, Package, Search, AlertCircle, CheckCircle, Clock, X, ChevronDown, Download } from "lucide-react";
import Link from "next/link";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { Input } from "@/components/ui/input";
import { PartRequestDetailDialog } from "./components/PartRequestDetailDialog";
import { AdvancedFilters, FilterOption, QuickFilter } from "@/components/ui/advanced-filters";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/lib/hooks/useToast";

// Stats Grid Component
// Stats Grid Component
const StatsGrid = ({ stats, loading }: { stats: any, loading: boolean }) => {
    if (loading) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {[...Array(4)].map((_, i) => (
                    <Card key={i} className="shadow-sm border bg-muted/50">
                        <CardContent className="p-3">
                            <div className="h-4 w-20 bg-border rounded mb-2 animate-pulse" />
                            <div className="h-6 w-12 bg-border rounded animate-pulse" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    if (!stats) return null;

    const items = [
        { label: "Pending Requests", value: stats.pending_requests, color: "text-amber-600" },
        { label: "PO Created", value: stats.ordered_requests || stats.po_created_requests, color: "text-primary" },
        { label: "Received", value: stats.received_requests, color: "text-success" },
        { label: "Awaiting Stock", value: stats.awaiting_stock_requests, color: "text-purple-600" },
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {items.map((item, index) => (
                <Card key={index} className="shadow-sm border bg-card">
                    <CardContent className="p-3 flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{item.label}</span>
                        <span className={`text-lg font-bold ${item.color || 'text-foreground'} text-foreground`}>
                            {item.value?.toLocaleString() || 0}
                        </span>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
};

export default function PartsRequestsPage() {
    const [selectedWoId, setSelectedWoId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const { toast } = useToast();

    // We are currently filtering client-side for search, but backend for status.
    // The original page only fetched "pending" status. 
    // We should probably allow filtering by other statuses if we want a full view, 
    // but the page title is "Parts Requests" (often implying pending).
    // Let's default to "pending" but allow changing via filters if desired, 
    // OR just keep it focused on pending if that's the business logic.
    // The user requirement says "Parts Requests", usually implies managing the queue.
    // Let's assume we want to see all requests but filterable. 
    // BUT the original code hardcoded { status: "pending" }.
    // I will expose a filter for status default to "pending".

    const [activeStatus, setActiveStatus] = useState<string>("all");

    // Fetch stats
    const { data: stats, isLoading: statsLoading } = useQuery({
        queryKey: ["parts-requests-stats"],
        queryFn: () => workordersApi.parts.dashboardStats(),
    });

    // Fetch parts list
    const { data: parts = [], isLoading, refetch } = useQuery({
        queryKey: ["parts-requests", activeStatus],
        queryFn: async () => {
            const response = await workordersApi.parts.list({
                status: activeStatus === "all" ? undefined : activeStatus
            });
            return Array.isArray(response) ? response : (response as any).results || [];
        },
    });

    // Group parts by Work Order
    const groupedParts = (parts as WorkOrderPart[]).reduce((acc: Record<number, WorkOrderPart[]>, part: WorkOrderPart) => {
        const woId = part.work_order;
        if (!acc[woId]) {
            acc[woId] = [];
        }
        acc[woId].push(part);
        return acc;
    }, {});

    const workOrderIds = Object.keys(groupedParts).map(Number);

    // Filter by search query (Client side)
    const filteredWoIds = workOrderIds.filter(woId => {
        const woParts = groupedParts[woId];
        if (!woParts || woParts.length === 0) return false;

        const firstPart = woParts[0];
        const searchLower = searchQuery.toLowerCase();

        return (
            (firstPart.work_order_number?.toLowerCase().includes(searchLower)) ||
            (firstPart.customer_name?.toLowerCase().includes(searchLower)) ||
            (firstPart.vehicle_info?.toLowerCase().includes(searchLower))
        );
    });

    const handleViewDetails = (woId: number) => {
        setSelectedWoId(woId);
    };

    const handleExport = () => {
        toast({ title: "Export", description: "Export functionality coming soon" });
    };

    const filterOptions: FilterOption[] = [
        {
            key: "status",
            label: "Status",
            type: "select",
            options: [
                { value: "pending", label: "Pending" },
                { value: "ordered", label: "Ordered" },
                { value: "received", label: "Received" },
                { value: "all", label: "All Statuses" },
            ],
        },
    ];

    return (
        <PermissionGuard permissions={['view_workorder']}>
            <div className="space-y-6">
                {/* Header Block */}
                <div className="flex flex-col space-y-4">
                    <div className="flex justify-between items-center pt-2">
                        <div>
                            <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
                                <Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link>
                                <span>/</span>
                                <Link href="/inventory" className="hover:text-primary transition-colors">Inventory</Link>
                                <span>/</span>
                                <span className="text-foreground font-medium">Parts Requests</span>
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight text-foreground">
                                Parts Requests
                            </h1>
                        </div>
                    </div>

                    <StatsGrid stats={stats} loading={statsLoading} />
                </div>

                {/* Unified Toolbar */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card/50 p-1 rounded-lg">
                    <div className="flex items-center gap-2 flex-1 w-full md:w-auto">
                        <div className="relative flex-1 md:flex-none md:w-64">
                            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                            <Input
                                placeholder="Search requests..."
                                className="pl-9 h-9 text-sm bg-muted border-none focus:ring-1 transition-all"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        {/* Manual Filter for Status since AdvancedFilters handles object state 
                             and we are using simple string state for activeStatus here */}
                        <div className="flex items-center">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-9 border-dashed shadow-sm">
                                        <AlertCircle className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                                        Status: {activeStatus === 'all' ? 'All' : activeStatus.charAt(0).toUpperCase() + activeStatus.slice(1)}
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-48">
                                    <DropdownMenuItem onClick={() => setActiveStatus("pending")}>
                                        <div className="flex items-center justify-between w-full">
                                            Pending
                                            {activeStatus === "pending" && <CheckCircle className="w-3.5 h-3.5 text-primary" />}
                                        </div>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setActiveStatus("po_created")}>
                                        <div className="flex items-center justify-between w-full">
                                            PO Created
                                            {activeStatus === "po_created" && <CheckCircle className="w-3.5 h-3.5 text-primary" />}
                                        </div>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setActiveStatus("awaiting_stock")}>
                                        <div className="flex items-center justify-between w-full">
                                            Awaiting Stock
                                            {activeStatus === "awaiting_stock" && <CheckCircle className="w-3.5 h-3.5 text-primary" />}
                                        </div>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setActiveStatus("received")}>
                                        <div className="flex items-center justify-between w-full">
                                            Received
                                            {activeStatus === "received" && <CheckCircle className="w-3.5 h-3.5 text-primary" />}
                                        </div>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setActiveStatus("ready")}>
                                        <div className="flex items-center justify-between w-full">
                                            Allocated (Ready)
                                            {activeStatus === "ready" && <CheckCircle className="w-3.5 h-3.5 text-primary" />}
                                        </div>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setActiveStatus("all")}>
                                        <div className="flex items-center justify-between w-full">
                                            All Statuses
                                            {activeStatus === "all" && <CheckCircle className="w-3.5 h-3.5 text-primary" />}
                                        </div>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
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
                    </div>
                </div>

                <Card className="border-none shadow-sm overflow-hidden ring-1 ring-gray-200 dark:ring-gray-800">
                    <div className="p-0">
                        {isLoading ? (
                            <div className="p-6"><TableSkeleton rows={8} columns={5} /></div>
                        ) : filteredWoIds.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <Package className="w-12 h-12 text-gray-300 text-muted-foreground mb-4" />
                                <h3 className="text-lg font-medium text-foreground">No requests found</h3>
                                <p className="text-muted-foreground max-w-sm mt-1 mb-4">
                                    {searchQuery ? "Try adjusting your search terms." : `There are no ${activeStatus === 'all' ? '' : activeStatus} parts requests.`}
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-muted/50 border-y border-border">
                                        <TableRow className="hover:bg-transparent border-none">
                                            <TableHead className="w-[180px] h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Work Order</TableHead>
                                            <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Customer</TableHead>
                                            <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Vehicle</TableHead>
                                            <TableHead className="text-center h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Requested Parts</TableHead>
                                            <TableHead className="text-right h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredWoIds.map(woId => {
                                            const woParts = groupedParts[woId];
                                            const firstPart = woParts[0];
                                            const woNumber = firstPart.work_order_number || `WO #${woId}`;

                                            return (
                                                <TableRow
                                                    key={woId}
                                                    className="group hover:bg-muted/50 dark:hover:bg-gray-800/50 border-b border-border cursor-pointer transition-colors"
                                                    onClick={() => handleViewDetails(woId)}
                                                >
                                                    <TableCell className="font-mono text-xs font-medium text-primary px-4 py-2">
                                                        {woNumber}
                                                    </TableCell>
                                                    <TableCell className="text-sm font-medium text-foreground px-4 py-2">
                                                        {firstPart.customer_name || "Unknown"}
                                                    </TableCell>
                                                    <TableCell className="text-xs text-muted-foreground px-4 py-2">
                                                        {firstPart.vehicle_info || "Unknown Vehicle"}
                                                    </TableCell>
                                                    <TableCell className="text-center px-4 py-2">
                                                        <Badge variant="secondary" className="font-mono text-xs bg-border text-muted-foreground">
                                                            {woParts.length}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right px-4 py-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 text-xs font-medium text-primary hover:text-primary hover:bg-primary/10 dark:hover:bg-orange-900/20"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleViewDetails(woId);
                                                            }}
                                                        >
                                                            Review Request
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </div>
                </Card>

                <PartRequestDetailDialog
                    open={!!selectedWoId}
                    onOpenChange={(open) => !open && setSelectedWoId(null)}
                    workOrderId={selectedWoId}
                    parts={selectedWoId ? (groupedParts[selectedWoId] || []) : []}
                    onRefresh={refetch}
                />
            </div>
        </PermissionGuard>
    );
}
