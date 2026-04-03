"use client";

// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { billingApi, Bill } from "@/lib/api/billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { Plus, Search, FileText, AlertCircle, CheckCircle, Clock, Trash2, Download, Eye, X, Printer, DollarSign, Ban, CreditCard, Filter } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { AdvancedFilters, FilterOption } from "@/components/ui/advanced-filters";
import { SortConfig } from "@/components/ui/sortable-header";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

export default function BillsPage() {
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    // * eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const [advancedFilters, setAdvancedFilters] = useState<Record<string, any>>({});

    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);


    const queryClient = useQueryClient();

    const { toast } = useToast();
    const router = useRouter();
    const { formatCurrency } = useCurrency();

    // Advanced filter options
    const filterOptions: FilterOption[] = [
        {
            key: "status",
            label: "Status",
            type: "select",
            options: [
                { value: "draft", label: "Draft" },
                { value: "open", label: "Open" },
                { value: "partially_paid", label: "Partially Paid" },
                { value: "paid", label: "Paid" },
                { value: "overdue", label: "Overdue" },
                { value: "void", label: "Void" },
            ],
        },
        {
            key: "bill_date",
            label: "Bill Date",
            type: "daterange",
        },
        {
            key: "due_date",
            label: "Due Date",
            type: "daterange",
        },
    ];


    const { data, isLoading, error } = useQuery({
        queryKey: ["bills", page, search, advancedFilters, sortConfig],
        queryFn: () => {
            const ordering = sortConfig
                ? `${sortConfig.direction === "desc" ? "-" : ""}${sortConfig.field}`
                : undefined;
            return billingApi.bills.list({
                page,
                status: advancedFilters.status || undefined,
                search: search || undefined,
                date_from: advancedFilters.bill_date_from || undefined,
                date_to: advancedFilters.bill_date_to || undefined,
                due_date_from: advancedFilters.due_date_from || undefined,
                due_date_to: advancedFilters.due_date_to || undefined,
                ordering,
            });
        },
    });

    const getStatusVariant = (status: string) => {
        switch (status) {
            case "paid":
                return "success";
            case "open":
                return "info";
            case "draft":
                return "default";
            case "partially_paid":
                return "warning";
            case "overdue":
                return "danger";
            case "void":
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
                return <Ban className="w-4 h-4" />;
            case "partially_paid":
                return <CreditCard className="w-4 h-4" />;
            case "open":
                return <Clock className="w-4 h-4" />;
            default:
                return <FileText className="w-4 h-4" />;
        }
    };

    // Calculate summary stats
    const totalBills = data?.count || 0;
    const totalAmount = data?.results?.reduce((sum, bill) => sum + parseFloat(bill.total || "0"), 0) || 0;
    const totalDue = data?.results?.reduce((sum, bill) => sum + parseFloat(bill.amount_due || "0"), 0) || 0;
    const overdueCount = data?.results?.filter((bill) => bill.status === "overdue").length || 0;

    return (
        <div className="space-y-4 min-h-screen">
            <div className="flex items-center justify-between pt-2">
                <div>
                    <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
                        <Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link>
                        <span>/</span>
                        <Link href="/billing" className="hover:text-primary transition-colors">Billing</Link>
                        <span>/</span>
                        <span className="text-foreground font-medium">Bills</span>
                    </div>
                    <h1 className="text-xl font-bold text-foreground tracking-tight">Vendor Bills</h1>
                </div>
                <div className="flex items-center space-x-2">
                    <PermissionGuard permission="create_bills">
                        <Link href="/billing/bills/new">
                            <Button size="sm" className="h-9">
                                <Plus className="w-3.5 h-3.5 mr-1.5" />
                                New Bill
                            </Button>
                        </Link>
                    </PermissionGuard>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="shadow-none border-none bg-muted/50">
                    <CardContent className="p-4 flex flex-col gap-1">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Bills</span>
                        <div className="flex items-end justify-between">
                            <span className="text-xl font-bold text-foreground">{totalBills}</span>
                            <FileText className="w-5 h-5 text-muted-foreground mb-0.5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-none border-none bg-muted/50">
                    <CardContent className="p-4 flex flex-col gap-1">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Amount</span>
                        <div className="flex items-end justify-between">
                            <span className="text-xl font-bold text-foreground">{formatCurrency(totalAmount)}</span>
                            <DollarSign className="w-5 h-5 text-muted-foreground mb-0.5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-none border-none bg-muted/50">
                    <CardContent className="p-4 flex flex-col gap-1">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount Due</span>
                        <div className="flex items-end justify-between">
                            <span className="text-xl font-bold text-yellow-600">{formatCurrency(totalDue)}</span>
                            <CreditCard className="w-5 h-5 text-yellow-500/50 mb-0.5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-none border-none bg-muted/50">
                    <CardContent className="p-4 flex flex-col gap-1">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Overdue</span>
                        <div className="flex items-end justify-between">
                            <span className="text-xl font-bold text-destructive">{overdueCount}</span>
                            <AlertCircle className="w-5 h-5 text-destructive/50 mb-0.5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filter Bar */}
            <Card className="border-none shadow-sm bg-muted/50">
                <CardContent className="p-3">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-3 flex-wrap">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
                                <Input
                                    type="text"
                                    placeholder="Search bills..."
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setPage(1);
                                    }}
                                    className="pl-9 h-8 text-sm bg-card w-64 focus:w-80 transition-all duration-300"
                                />
                            </div>

                            <AdvancedFilters
                                filters={filterOptions}
                                activeFilters={advancedFilters}
                                onFiltersChange={(filters) => {
                                    setAdvancedFilters(filters);
                                    setPage(1);
                                }}
                                onClear={() => {
                                    setAdvancedFilters({});
                                }}
                                title="Advanced Bill Filters"
                            />

                            {(search || Object.keys(advancedFilters).length > 0) && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setSearch("");
                                        setAdvancedFilters({});
                                        setPage(1);
                                    }}
                                    className="h-8 text-muted-foreground hover:text-destructive"
                                >
                                    <X className="w-3.5 h-3.5 mr-1" />
                                    Clear
                                </Button>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Bills Table */}
            <Card className="border-t shadow-sm">
                <CardHeader className="py-3 px-4 border-b bg-muted/30">
                    <CardTitle className="text-sm font-semibold text-card-foreground">
                        All Bills <span className="text-muted-foreground font-normal ml-1">({data?.count || 0})</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <TableSkeleton rows={8} columns={9} />
                    ) : data?.results && data.results.length > 0 ? (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Bill #</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Vendor</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Ref #</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Bill Date</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Due Date</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Total</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Due</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Status</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.results.map((bill) => (
                                        <TableRow
                                            key={bill.id}
                                            className="group hover:bg-muted/80 transition-colors border-b border-border last:border-0 cursor-pointer"
                                            onClick={() => router.push(`/billing/bills/${bill.id}`)}
                                        >
                                            <TableCell className="px-4 py-2 font-mono text-xs font-medium text-foreground">
                                                {bill.bill_number}
                                            </TableCell>
                                            <TableCell className="px-4 py-2">
                                                <span className="text-sm font-medium text-foreground">{bill.vendor_name || "N/A"}</span>
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-xs text-muted-foreground">
                                                {bill.reference_number || "-"}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-xs text-muted-foreground">
                                                {bill.bill_date ? format(new Date(bill.bill_date), "MMM dd, yyyy") : "-"}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-xs text-muted-foreground">
                                                {bill.due_date ? format(new Date(bill.due_date), "MMM dd, yyyy") : "-"}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-right font-medium text-sm text-foreground">
                                                {formatCurrency(parseFloat(bill.total || "0"))}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-right text-sm text-destructive font-medium">
                                                {formatCurrency(parseFloat(bill.amount_due || "0"))}
                                            </TableCell>
                                            <TableCell className="px-4 py-2">

                                                <Badge variant={getStatusVariant(bill.status) as any} className="text-[10px] px-2 py-0.5 font-medium border shadow-none bg-transparent">
                                                    <span className="flex items-center gap-1.5">
                                                        {getStatusIcon(bill.status)}
                                                        <span className="capitalize">{bill.status.replace("_", " ")}</span>
                                                    </span>
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-right">
                                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary">
                                                    <Eye className="w-3.5 h-3.5" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <p className="text-muted-foreground text-sm">No bills found.</p>
                            <PermissionGuard permission="create_bills">
                                <Link href="/billing/bills/new">
                                    <Button className="mt-4" variant="outline" size="sm">
                                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                                        Create First Bill
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
                        Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, data.count)} of {data.count} bills
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
        </div>
    );
}
