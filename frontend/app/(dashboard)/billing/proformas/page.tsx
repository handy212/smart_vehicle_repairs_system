"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, FileText, Download, X, Printer, Eye, Edit } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { exportToCSV } from "@/lib/utils/export";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { AdvancedFilters, FilterOption } from "@/components/ui/advanced-filters";
import { SortConfig } from "@/components/ui/sortable-header";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { usePrint } from "@/lib/hooks/usePrint";

export default function ProformasPage() {
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [advancedFilters, setAdvancedFilters] = useState<Record<string, any>>({
        status: "proforma"
    });
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

    const queryClient = useQueryClient();
    const { toast } = useToast();
    const router = useRouter();
    const { formatCurrency } = useCurrency();
    const { downloadPDF } = usePrint();

    // Advanced filter options (simplified for proformas)
    const filterOptions: FilterOption[] = [
        {
            key: "invoice_date",
            label: "Date",
            type: "daterange",
        },
    ];

    const { data, isLoading, error } = useQuery({
        queryKey: ["proformas", page, search, advancedFilters, sortConfig],
        queryFn: () => {
            const ordering = sortConfig
                ? `${sortConfig.direction === "desc" ? "-" : ""}${sortConfig.field}`
                : undefined;
            return billingApi.invoices.list({
                page,
                status: "proforma",
                search: search || undefined,
                invoice_date__gte: advancedFilters.invoice_date_from || undefined,
                invoice_date__lte: advancedFilters.invoice_date_to || undefined,
                ordering,
            });
        },
    });

    const invoices = data?.results || [];

    const handleExport = () => {
        if (!data?.results || data.results.length === 0) return;

        exportToCSV(
            data.results,
            "proforma_invoices",
            [
                { key: "invoice_number", label: "Number" },
                { key: "customer_name", label: "Customer" },
                { key: "invoice_date", label: "Date" },
                { key: "total", label: "Total" },
                { key: "status", label: "Status" },
            ]
        );
        toast({ title: "Success", description: "Proformas exported successfully" });
    };

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                Error loading proformas. Please try again.
            </div>
        );
    }

    return (
        <div className="space-y-4 min-h-screen">
            <div className="flex items-center justify-between pt-2">
                <div>
                    <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
                        <Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link>
                        <span>/</span>
                        <Link href="/billing" className="hover:text-primary transition-colors">Billing</Link>
                        <span>/</span>
                        <span className="text-foreground font-medium">Proforma Invoices</span>
                    </div>
                    <h1 className="text-xl font-bold text-foreground tracking-tight">Proforma Invoices</h1>
                </div>
                <div className="flex items-center space-x-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExport}
                        disabled={!data?.results || data.results.length === 0}
                        className="h-9"
                    >
                        <Download className="w-3.5 h-3.5 mr-1.5" />
                        Export
                    </Button>
                    <PermissionGuard permission="create_invoices">
                        <Link href="/billing/proformas/new">
                            <Button size="sm" className="h-9">
                                <Plus className="w-3.5 h-3.5 mr-1.5" />
                                New Proforma
                            </Button>
                        </Link>
                    </PermissionGuard>
                </div>
            </div>

            {/* Filter Bar */}
            <Card className="border-none shadow-sm bg-muted/50">
                <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
                            <Input
                                type="text"
                                placeholder="Search proformas..."
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setPage(1);
                                }}
                                className="pl-9 h-8 text-sm bg-card focus:ring-1 focus:ring-primary"
                            />
                        </div>
                        <AdvancedFilters
                            filters={filterOptions}
                            activeFilters={advancedFilters}
                            onFiltersChange={(filters) => {
                                setAdvancedFilters({ ...filters, status: "proforma" });
                                setPage(1);
                            }}
                            onClear={() => setAdvancedFilters({ status: "proforma" })}
                            title="Filter Proformas"
                        />
                        {search && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSearch("")}
                                className="h-8 text-muted-foreground"
                            >
                                <X className="w-3.5 h-3.5 mr-1" />
                                Clear
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Table */}
            <Card className="border-t shadow-sm">
                <CardContent className="p-0">
                    {isLoading ? (
                        <TableSkeleton rows={8} columns={6} />
                    ) : invoices.length > 0 ? (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead className="px-4 h-10 text-[10px] uppercase font-semibold text-muted-foreground">Number</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase font-semibold text-muted-foreground">Customer</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase font-semibold text-muted-foreground">Date</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase font-semibold text-muted-foreground text-right">Total</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase font-semibold text-muted-foreground">Status</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase font-semibold text-muted-foreground text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {invoices.map((invoice) => (
                                        <TableRow
                                            key={invoice.id}
                                            className="group hover:bg-muted/80 transition-colors cursor-pointer"
                                            onDoubleClick={() => router.push(`/billing/proformas/${invoice.id}`)}
                                        >
                                            <TableCell className="px-4 py-2 font-mono text-xs font-medium">
                                                {invoice.invoice_number || "-"}
                                            </TableCell>
                                            <TableCell className="px-4 py-2">
                                                <span className="text-sm font-medium text-foreground">{invoice.customer_name || "N/A"}</span>
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-xs text-muted-foreground">
                                                {invoice.invoice_date ? format(new Date(invoice.invoice_date), "MMM dd, yyyy") : "-"}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-right font-medium text-sm">
                                                {formatCurrency(parseFloat(invoice.total || "0"))}
                                            </TableCell>
                                            <TableCell className="px-4 py-2">
                                                <Badge variant="info" className="text-[10px] px-2 py-0.5 font-medium border shadow-none bg-transparent">
                                                    Proforma
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-right">
                                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Link href={`/billing/proformas/${invoice.id}`}>
                                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                                            <Eye className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </Link>
                                                    <PermissionGuard permission="edit_invoices">
                                                        <Link href={`/billing/invoices/${invoice.id}/edit`}>
                                                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-success">
                                                                <Edit className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </Link>
                                                    </PermissionGuard>
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
                                                        className="h-7 w-7 p-0"
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
                            <p className="text-muted-foreground text-sm">No proforma invoices found.</p>
                            <Link href="/billing/proformas/new">
                                <Button className="mt-4" variant="outline" size="sm">
                                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                                    Create First Proforma
                                </Button>
                            </Link>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Pagination */}
            {data && data.count > 20 && (
                <div className="flex items-center justify-between px-2">
                    <div className="text-sm text-muted-foreground">
                        Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, data.count)} of {data.count} proformas
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
