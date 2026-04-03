"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
    FileText,
    Plus,
    Search,
    Filter,
    MoreVertical,
    Eye,
    Download,
} from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { useToast } from "@/lib/hooks/useToast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "next/navigation";

import { useCurrency } from "@/lib/hooks/useCurrency";
export default function CreditNotesPage() {
    const { formatCurrency } = useCurrency();
    const router = useRouter();

    const { toast } = useToast();

    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const debouncedSearch = useDebounce(search, 500);

    const { data, isLoading, error } = useQuery({
        queryKey: ["creditNotes", page, debouncedSearch, statusFilter],
        queryFn: () =>
            billingApi.creditNotes.list({
                page,
                search: debouncedSearch,
                status: statusFilter === "all" ? undefined : statusFilter,
                ordering: "-credit_date",
            }),
    });

    const getStatusVariant = (status: string) => {
        switch (status) {
            case "issued":
                return "success";
            case "applied":
                return "info";
            case "refunded":
                return "secondary";
            case "draft":
                return "default";
            case "void":
                return "danger";
            default:
                return "default";
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        <FileText className="h-6 w-6 text-primary" />
                        Credit Notes
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Manage customer credit notes and refunds
                    </p>
                </div>
                <Link href="/billing/credit-notes/new">
                    <Button className="bg-primary hover:bg-primary/90">
                        <Plus className="mr-2 h-4 w-4" /> New Credit Note
                    </Button>
                </Link>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row gap-4 justify-between">
                        <div className="relative w-full sm:w-96">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search credit notes..."
                                className="pl-9"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2 items-center">
                            <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                            <Select
                                value={statusFilter}
                                onValueChange={(val) => setStatusFilter(val)}
                            >
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="All Statuses" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Statuses</SelectItem>
                                    <SelectItem value="draft">Draft</SelectItem>
                                    <SelectItem value="issued">Issued</SelectItem>
                                    <SelectItem value="applied">Applied</SelectItem>
                                    <SelectItem value="refunded">Refunded</SelectItem>
                                    <SelectItem value="void">Void</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        </div>
                    ) : error ? (
                        <div className="bg-destructive/10 text-destructive p-4 rounded-md">

                            Error details: {(error as any).message || "Detailed error information unavailable"}
                        </div>
                    ) : !data?.results?.length ? (
                        <div className="text-center py-12 text-muted-foreground">
                            No credit notes found.
                        </div>
                    ) : (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Number</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Customer</TableHead>
                                        <TableHead>Original Invoice</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                        <TableHead className="text-right">Unused</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.results.map((cn) => (
                                        <TableRow key={cn.id}>
                                            <TableCell className="font-medium text-primary">
                                                <Link href={`/billing/credit-notes/${cn.id}`}>
                                                    {cn.credit_note_number}
                                                </Link>
                                            </TableCell>
                                            <TableCell>
                                                {format(new Date(cn.credit_date), "MMM d, yyyy")}
                                            </TableCell>
                                            <TableCell>
                                                {typeof cn.customer === "object" ? cn.customer.full_name : cn.customer_name}
                                            </TableCell>
                                            <TableCell>
                                                {cn.invoice_number ? (
                                                    <Link href={`/billing/invoices/${typeof cn.invoice === 'object' ? cn.invoice.id : cn.invoice}`} className="text-primary hover:underline">
                                                        {cn.invoice_number}
                                                    </Link>
                                                ) : (
                                                    "-"
                                                )}
                                            </TableCell>
                                            <TableCell>

                                                <Badge variant={getStatusVariant(cn.status) as any}>
                                                    {cn.status.toUpperCase()}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-medium">
                                                {formatCurrency(parseFloat(cn.total))}
                                            </TableCell>
                                            <TableCell className="text-right text-muted-foreground">
                                                {formatCurrency(parseFloat(cn.unused_amount))}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-8 w-8 p-0">
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => router.push(`/billing/credit-notes/${cn.id}`)}>
                                                            <Eye className="mr-2 h-4 w-4" />
                                                            View Details
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem>
                                                            <Download className="mr-2 h-4 w-4" />
                                                            Download PDF
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
