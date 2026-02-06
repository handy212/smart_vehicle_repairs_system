"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, FileText, AlertCircle, CheckCircle, Clock, Trash2, Download, Mail, Edit, MoreVertical, ChevronDown, Eye, X, Printer, DollarSign, Ban, CreditCard } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { exportToCSV } from "@/lib/utils/export";
import { useBulkSelection } from "@/lib/hooks/useBulkSelection";
import { BulkActionToolbar } from "@/components/ui/bulk-action-toolbar";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { AdvancedFilters, FilterOption, QuickFilter } from "@/components/ui/advanced-filters";
import { SortConfig } from "@/components/ui/sortable-header";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { usePrint } from "@/lib/hooks/usePrint";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export default function InvoicesPage() {
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [advancedFilters, setAdvancedFilters] = useState<Record<string, any>>({});
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
    const [openMenuId, setOpenMenuId] = useState<number | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
    const [showActionsMenu, setShowActionsMenu] = useState(false);

    // Bulk Action State
    const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
    const [bulkStatus, setBulkStatus] = useState<string>("");

    const queryClient = useQueryClient();
    const { toast } = useToast();
    const router = useRouter();
    const { formatCurrency } = useCurrency();
    const { downloadPDF } = usePrint();
    const { hasPermission } = usePermissions();




    // Advanced filter options
    const filterOptions: FilterOption[] = [
        {
            key: "status",
            label: "Status",
            type: "select",
            options: [
                { value: "draft", label: "Draft" },
                { value: "unpaid", label: "Unpaid" },
                { value: "proforma", label: "Proforma" },
                { value: "sent", label: "Sent" },
                { value: "viewed", label: "Viewed" },
                { value: "partial", label: "Partially Paid" },
                { value: "paid", label: "Paid" },
                { value: "overdue", label: "Overdue" },
                { value: "void", label: "Void" },
                { value: "cancelled", label: "Cancelled" },
            ],
        },
        {
            key: "invoice_date",
            label: "Invoice Date",
            type: "daterange",
        },
        {
            key: "due_date",
            label: "Due Date",
            type: "daterange",
        },
    ];

    const quickFilters: QuickFilter[] = [
        {
            label: "Unpaid",
            value: "unpaid",
            filters: {
                status: "unpaid",
            },
        },
        {
            label: "Overdue",
            value: "overdue",
            filters: {
                status: "overdue",
            },
        },
        {
            label: "This Month",
            value: "this_month",
            filters: {
                invoice_date_from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0],
                invoice_date_to: new Date().toISOString().split("T")[0],
            },
        },
    ];

    const { data, isLoading, error } = useQuery({
        queryKey: ["invoices", page, search, advancedFilters, sortConfig],
        queryFn: () => {
            const ordering = sortConfig
                ? `${sortConfig.direction === "desc" ? "-" : ""}${sortConfig.field}`
                : undefined;
            return billingApi.invoices.list({
                page,
                status: advancedFilters.status || undefined,
                search: search || undefined,
                invoice_date__gte: advancedFilters.invoice_date_from || undefined,
                invoice_date__lte: advancedFilters.invoice_date_to || undefined,
                due_date__gte: advancedFilters.due_date_from || undefined,
                due_date__lte: advancedFilters.due_date_to || undefined,
                ordering,
            });
        },
    });

    const { data: stats } = useQuery({
        queryKey: ["invoice-stats"],
        queryFn: () => billingApi.invoices.stats(),
    });

    const invoices = data?.results || [];
    const bulkSelection = useBulkSelection(invoices);

    // Bulk Mutations
    const bulkSendMutation = useMutation({
        mutationFn: (ids: number[]) => billingApi.invoices.bulkSend(ids),
        onSuccess: (data) => {
            toast({
                title: "Invoices Sent",
                description: data.message,
                variant: "success",
            });
            bulkSelection.clearSelection();
            queryClient.invalidateQueries({ queryKey: ["invoices"] });
        },
        onError: (error: any) => {
            toast({
                title: "Error Sending Invoices",
                description: error.response?.data?.error || "Failed to send invoices",
                variant: "destructive",
            });
        }
    });

    const bulkUpdateStatusMutation = useMutation({
        mutationFn: (data: { ids: number[], status: string }) =>
            billingApi.invoices.bulkUpdateStatus(data.ids, data.status),
        onSuccess: (data) => {
            toast({
                title: "Status Updated",
                description: data.message,
                variant: "success",
            });
            bulkSelection.clearSelection();
            setIsStatusDialogOpen(false);
            setBulkStatus("");
            queryClient.invalidateQueries({ queryKey: ["invoices"] });
        },
        onError: (error: any) => {
            toast({
                title: "Error Updating Status",
                description: error.response?.data?.error || "Failed to update status",
                variant: "destructive",
            });
        }
    });

    const handleBulkSend = () => {
        if (!confirm(`Are you sure you want to mark ${bulkSelection.selectedCount} invoices as sent?`)) return;
        bulkSendMutation.mutate(bulkSelection.selectedIds);
    };

    const handleBulkStatusUpdate = () => {
        setIsStatusDialogOpen(true);
    };

    const confirmStatusUpdate = () => {
        if (!bulkStatus) {
            toast({
                title: "Select Status",
                description: "Please select a status to apply",
                variant: "destructive",
            });
            return;
        }
        bulkUpdateStatusMutation.mutate({
            ids: bulkSelection.selectedIds,
            status: bulkStatus
        });
    };

    const handleExport = () => {
        if (!data?.results || data.results.length === 0) {
            toast({
                title: "No Data",
                description: "No invoices to export",
                variant: "destructive",
            });
            return;
        }

        exportToCSV(
            data.results,
            "invoices",
            [
                { key: "invoice_number", label: "Invoice Number" },
                { key: "customer_name", label: "Customer" },
                { key: "invoice_date", label: "Date" },
                { key: "due_date", label: "Due Date" },
                { key: "total", label: "Total" },
                { key: "amount_paid", label: "Amount Paid" },
                { key: "balance_due", label: "Balance Due" },
                { key: "status", label: "Status" },
            ]
        );

        toast({ title: "Success", description: "Invoices exported successfully" });
    };

    if (isLoading && !data) {
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <div className="h-9 w-48 bg-gray-200 rounded animate-pulse mb-2"></div>
                        <div className="h-5 w-64 bg-gray-200 rounded animate-pulse"></div>
                    </div>
                </div>
                <Card>
                    <CardContent className="pt-6">
                        <TableSkeleton rows={8} columns={9} />
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                Error loading invoices. Please try again.
            </div>
        );
    }

    const getStatusVariant = (status: string) => {
        switch (status) {
            case "paid":
                return "success";
            case "finalized":
            case "proforma":
                return "info";
            case "draft":
                return "default";
            case "partial":
                return "warning";
            case "overdue":
                return "danger";
            case "void":
            case "cancelled":
                return "secondary";
            default:
                return "default";
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case "paid":
                return <CheckCircle className="w-4 h-4" />;
            case "overdue":
                return <AlertCircle className="w-4 h-4" />;
            case "void":
            case "cancelled":
                return <Ban className="w-4 h-4" />;
            case "partially_paid":
                return <CreditCard className="w-4 h-4" />;
            default:
                return <FileText className="w-4 h-4" />;
        }
    };

    // Calculate summary stats
    const totalInvoices = data?.count || 0;
    const totalAmount = data?.results?.reduce((sum, inv) => sum + parseFloat(inv.total || "0"), 0) || 0;
    const totalDue = data?.results?.reduce((sum, inv) => sum + parseFloat(inv.balance_due || inv.total || "0"), 0) || 0;
    const overdueCount = data?.results?.filter((inv) => inv.status === "overdue").length || 0;

    return (
        <div className="space-y-4 min-h-screen">
            <div className="flex items-center justify-between pt-2">
                <div>
                    <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
                        <Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link>
                        <span>/</span>
                        <Link href="/billing" className="hover:text-primary transition-colors">Billing</Link>
                        <span>/</span>
                        <span className="text-foreground font-medium">Invoices</span>
                    </div>
                    <h1 className="text-xl font-bold text-foreground tracking-tight">Invoices</h1>
                </div>
                <div className="flex items-center space-x-4">
                    {/* Mini Widget - Simple Text Version */}


                    <div className="relative">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowActionsMenu(!showActionsMenu)}
                            className="h-9 border-border text-foreground"
                        >
                            Actions
                            <ChevronDown className="w-3.5 h-3.5 ml-2" />
                        </Button>
                        {showActionsMenu && (
                            <>
                                <div
                                    className="fixed inset-0 z-10"
                                    onClick={() => setShowActionsMenu(false)}
                                />
                                <div className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-md shadow-lg z-20">
                                    <div className="py-1">
                                        <PermissionGuard permission="export_invoices">
                                            <button
                                                onClick={() => {
                                                    handleExport();
                                                    setShowActionsMenu(false);
                                                }}
                                                disabled={!data?.results || data.results.length === 0}
                                                className="w-full text-left px-4 py-2 text-sm text-card-foreground hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                            >
                                                <Download className="w-4 h-4" />
                                                Export CSV
                                            </button>
                                        </PermissionGuard>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                    <PermissionGuard permission="create_invoices">
                        <Link href="/billing/invoices/new">
                            <Button size="sm" className="h-9">
                                <Plus className="w-3.5 h-3.5 mr-1.5" />
                                New Invoice
                            </Button>
                        </Link>
                    </PermissionGuard>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Card
                    className={`shadow-sm border transition-all cursor-pointer hover:shadow-md ${advancedFilters.status === 'unpaid' ? 'ring-2 ring-primary bg-orange-50 dark:bg-gray-800' : 'bg-card'}`}
                    onClick={() => {
                        const newStatus = advancedFilters.status === 'unpaid' ? null : 'unpaid';
                        setAdvancedFilters({ ...advancedFilters, status: newStatus });
                        setPage(1);
                    }}
                >
                    <CardContent className="p-3 flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unpaid</span>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-primary">{stats?.counts.unpaid || 0}</span>
                            <FileText className="w-4 h-4 text-orange-500/50" />
                        </div>
                    </CardContent>
                </Card>
                <Card
                    className={`shadow-sm border transition-all cursor-pointer hover:shadow-md ${advancedFilters.status === 'paid' ? 'ring-2 ring-green-500 bg-success/10 dark:bg-gray-800' : 'bg-card'}`}
                    onClick={() => {
                        const newStatus = advancedFilters.status === 'paid' ? null : 'paid';
                        setAdvancedFilters({ ...advancedFilters, status: newStatus });
                        setPage(1);
                    }}
                >
                    <CardContent className="p-3 flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Paid</span>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-success">{stats?.counts.paid || 0}</span>
                            <CheckCircle className="w-4 h-4 text-green-500/50" />
                        </div>
                    </CardContent>
                </Card>
                <Card
                    className={`shadow-sm border transition-all cursor-pointer hover:shadow-md ${advancedFilters.status === 'partial' ? 'ring-2 ring-primary bg-primary/10 dark:bg-gray-800' : 'bg-card'}`}
                    onClick={() => {
                        const newStatus = advancedFilters.status === 'partial' ? null : 'partial';
                        setAdvancedFilters({ ...advancedFilters, status: newStatus });
                        setPage(1);
                    }}
                >
                    <CardContent className="p-3 flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Partially Paid</span>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-primary">{stats?.counts.partially_paid || 0}</span>
                            <CreditCard className="w-4 h-4 text-primary/50" />
                        </div>
                    </CardContent>
                </Card>
                <Card
                    className={`shadow-sm border transition-all cursor-pointer hover:shadow-md ${advancedFilters.status === 'overdue' ? 'ring-2 ring-red-500 bg-red-50 dark:bg-gray-800' : 'bg-card'}`}
                    onClick={() => {
                        const newStatus = advancedFilters.status === 'overdue' ? null : 'overdue';
                        setAdvancedFilters({ ...advancedFilters, status: newStatus });
                        setPage(1);
                    }}
                >
                    <CardContent className="p-3 flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Overdue</span>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-red-600">{stats?.counts.overdue || 0}</span>
                            <AlertCircle className="w-4 h-4 text-red-500/50" />
                        </div>
                    </CardContent>
                </Card>
                <Card
                    className={`shadow-sm border transition-all cursor-pointer hover:shadow-md ${advancedFilters.status === 'draft' ? 'ring-2 ring-gray-500 bg-muted' : 'bg-card'}`}
                    onClick={() => {
                        const newStatus = advancedFilters.status === 'draft' ? null : 'draft';
                        setAdvancedFilters({ ...advancedFilters, status: newStatus });
                        setPage(1);
                    }}
                >
                    <CardContent className="p-3 flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Draft</span>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-muted-foreground">{stats?.counts.draft || 0}</span>
                            <FileText className="w-4 h-4 text-muted-foreground" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Compact Filter Bar */}
            <Card className="border-none shadow-sm bg-muted/50">
                <CardContent className="p-3">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-3 flex-wrap">
                            {/* Search */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
                                <Input
                                    type="text"
                                    placeholder="Search invoices..."
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setPage(1);
                                    }}
                                    className="pl-9 h-8 text-sm bg-card w-64 focus:w-80 transition-all duration-300"
                                />
                            </div>

                            {/* Advanced Filters Button */}
                            <AdvancedFilters
                                filters={filterOptions}
                                quickFilters={quickFilters}
                                activeFilters={advancedFilters}
                                onFiltersChange={(filters) => {
                                    setAdvancedFilters(filters);
                                    setPage(1);
                                }}
                                onClear={() => {
                                    setAdvancedFilters({});
                                }}
                                title="Advanced Invoice Filters"
                            />

                            {/* Clear Filters */}
                            {(search || Object.keys(advancedFilters).length > 0) && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setSearch("");
                                        setAdvancedFilters({});
                                        setPage(1);
                                    }}
                                    className="h-8 text-muted-foreground hover:text-red-600"
                                >
                                    <X className="w-3.5 h-3.5 mr-1" />
                                    Clear
                                </Button>
                            )}

                            {/* Mini Widget - Simple Text Version (Moved here) */}
                            {stats && (
                                <div className="hidden md:flex items-center space-x-2 ml-auto text-sm">
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground font-medium">Paid Inv:</span>
                                        <span className="font-bold text-foreground">{formatCurrency(stats.financials.total_paid)}</span>
                                    </div>
                                    <div className="h-4 w-px bg-border"></div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground font-medium">Past Due Inv:</span>
                                        <span className="font-bold text-red-600">{formatCurrency(stats.financials.past_due_total)}</span>
                                    </div>
                                    <div className="h-4 w-px bg-border"></div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground font-medium">Outstanding Inv:</span>
                                        <span className="font-bold text-foreground">{formatCurrency(stats.financials.outstanding_total)}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Active Filter Badges */}
                        {(search || Object.keys(advancedFilters).length > 0) && (
                            <div className="flex flex-wrap items-center gap-2">
                                {search && (
                                    <Badge variant="secondary" className="flex items-center gap-1.5">
                                        <span className="text-xs">Search: {search}</span>
                                        <button
                                            onClick={() => {
                                                setSearch("");
                                                setPage(1);
                                            }}
                                            className="hover:text-red-600"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </Badge>
                                )}
                                {Object.entries(advancedFilters).map(([key, value]) => {
                                    if (!value || (typeof value === 'string' && value === '')) return null;
                                    const filter = filterOptions.find((f) => f.key === key || f.key === key.replace("_from", "").replace("_to", ""));
                                    if (!filter && !key.includes("_from") && !key.includes("_to")) return null;
                                    if (key.includes("_to")) return null;

                                    const displayValue = key.includes("_from") && advancedFilters[key.replace("_from", "_to")]
                                        ? `${value} - ${advancedFilters[key.replace("_from", "_to")]}`
                                        : String(value);

                                    const displayLabel = filter?.label || key.replace("_from", "").replace(/_/g, " ");

                                    return (
                                        <Badge key={key} variant="secondary" className="flex items-center gap-1.5">
                                            <span className="text-xs">{displayLabel}: {displayValue}</span>
                                            <button
                                                onClick={() => {
                                                    const newFilters = { ...advancedFilters };
                                                    if (key.includes("_from")) {
                                                        delete newFilters[key];
                                                        delete newFilters[key.replace("_from", "_to")];
                                                    } else {
                                                        delete newFilters[key];
                                                    }
                                                    setAdvancedFilters(newFilters);
                                                    setPage(1);
                                                }}
                                                className="hover:text-red-600"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </Badge>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Bulk Action Toolbar */}
            <BulkActionToolbar
                selectedCount={bulkSelection.selectedCount}
                onClearSelection={bulkSelection.clearSelection}
                onBulkDelete={() => { }}
                showBulkSend={true}
                showStatusUpdate={true}
                onBulkSend={hasPermission("create_invoices") ? handleBulkSend : undefined}
                onBulkStatusUpdate={hasPermission("edit_invoices") ? handleBulkStatusUpdate : undefined}
            />

            {/* Invoices Table */}
            <Card className="border-t shadow-sm">
                <CardHeader className="py-3 px-4 border-b bg-muted/30">
                    <CardTitle className="text-sm font-semibold text-card-foreground">
                        All Invoices <span className="text-muted-foreground font-normal ml-1">({data?.count || 0})</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <TableSkeleton rows={8} columns={10} />
                    ) : data?.results && data.results.length > 0 ? (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                                        <TableHead className="w-[40px] px-4">
                                            <input
                                                type="checkbox"
                                                checked={bulkSelection.isAllSelected}
                                                ref={(input) => {
                                                    if (input) input.indeterminate = bulkSelection.isIndeterminate;
                                                }}
                                                onChange={bulkSelection.toggleSelectAll}
                                                className="h-3.5 w-3.5 text-primary focus:ring-primary border-border rounded"
                                            />
                                        </TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Invoice #</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Customer</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Date</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Due Date</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Total</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Paid</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Due</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Status</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.results.map((invoice) => (
                                        <TableRow
                                            key={invoice.id}
                                            className="group hover:bg-muted/80 transition-colors border-b border-border last:border-0 cursor-pointer"
                                            onDoubleClick={() => router.push(`/billing/invoices/${invoice.id}`)}
                                        >
                                            <TableCell className="px-4 py-2">
                                                <input
                                                    type="checkbox"
                                                    checked={bulkSelection.isSelected(invoice.id)}
                                                    onChange={() => bulkSelection.toggleSelection(invoice.id)}
                                                    className="h-3.5 w-3.5 text-primary focus:ring-primary border-border rounded"
                                                />
                                            </TableCell>
                                            <TableCell className="px-4 py-2 font-mono text-xs font-medium text-foreground">
                                                {invoice.invoice_number || "-"}
                                            </TableCell>
                                            <TableCell className="px-4 py-2">
                                                <span className="text-sm font-medium text-foreground">{invoice.customer_name || "N/A"}</span>
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-xs text-muted-foreground">
                                                {invoice.invoice_date ? format(new Date(invoice.invoice_date), "MMM dd, yyyy") : "-"}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-xs text-muted-foreground">
                                                {invoice.due_date ? format(new Date(invoice.due_date), "MMM dd, yyyy") : "-"}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-right font-medium text-sm text-foreground">
                                                {formatCurrency(parseFloat(invoice.total || "0"))}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-right text-sm text-success">
                                                {formatCurrency(parseFloat(invoice.amount_paid || "0"))}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-right text-sm text-red-600 font-medium">
                                                {formatCurrency(parseFloat(invoice.balance_due || invoice.total || "0"))}
                                            </TableCell>
                                            <TableCell className="px-4 py-2">
                                                <Badge variant={getStatusVariant(invoice.status) as any} className="text-[10px] px-2 py-0.5 font-medium border shadow-none bg-transparent">
                                                    <span className="flex items-center gap-1.5">
                                                        {getStatusIcon(invoice.status)}
                                                        {invoice.status?.replace("_", " ") || invoice.status}
                                                    </span>
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-right">
                                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Link href={`/billing/invoices/${invoice.id}`}>
                                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary">
                                                            <Eye className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </Link>
                                                    {invoice.status === 'draft' && (
                                                        <PermissionGuard permission="edit_invoices">
                                                            <Link href={`/billing/invoices/${invoice.id}/edit`}>
                                                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-success">
                                                                    <Edit className="w-3.5 h-3.5" />
                                                                </Button>
                                                            </Link>
                                                        </PermissionGuard>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            downloadPDF({
                                                                documentType: 'invoice',
                                                                documentId: invoice.id,
                                                                documentNumber: invoice.invoice_number
                                                            });
                                                        }}
                                                        className="h-7 w-7 p-0 text-muted-foreground hover:text-purple-600"
                                                    >
                                                        <Printer className="w-3.5 h-3.5" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <p className="text-muted-foreground text-sm">No invoices found.</p>
                            <PermissionGuard permission="create_invoices">
                                <Link href="/billing/invoices/new">
                                    <Button className="mt-4" variant="outline" size="sm">
                                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                                        Create First Invoice
                                    </Button>
                                </Link>
                            </PermissionGuard>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Pagination */}
            {data && data.count > 20 && (
                <div className="flex items-center justify-between px-2">
                    <div className="text-sm text-muted-foreground">
                        Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, data.count)} of {data.count} invoices
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(page - 1)}
                            disabled={!data.previous}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(page + 1)}
                            disabled={!data.next}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}

            {/* Status Update Dialog */}
            <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Update Status for {bulkSelection.selectedCount} Invoices</DialogTitle>
                        <DialogDescription>
                            Select the new status to apply to the selected invoices.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="status" className="text-right">
                                Status
                            </Label>
                            <div className="col-span-3">
                                <select
                                    id="status"
                                    className="flex h-10 w-full rounded-md border border-border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                    value={bulkStatus}
                                    onChange={(e) => setBulkStatus(e.target.value)}
                                >
                                    <option value="" disabled>Select status</option>
                                    <option value="draft">Draft</option>
                                    <option value="proforma">Proforma</option>
                                    <option value="finalized">Finalized</option>
                                    <option value="sent">Sent</option>
                                    <option value="partially_paid">Partially Paid</option>
                                    <option value="paid">Paid</option>
                                    <option value="overdue">Overdue</option>
                                    <option value="void">Void</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsStatusDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={confirmStatusUpdate}
                            disabled={!bulkStatus || bulkUpdateStatusMutation.isPending}
                        >
                            {bulkUpdateStatusMutation.isPending ? "Updating..." : "Update Status"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
