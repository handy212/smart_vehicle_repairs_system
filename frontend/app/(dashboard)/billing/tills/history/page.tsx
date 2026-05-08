"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { tillApi, type Till } from "@/lib/api/till-refund";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { Search, ArrowLeft, Eye, Download } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { exportToCSV, exportToPDF } from "@/lib/utils/export";

export default function TillHistoryPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialStatus = (searchParams.get("status") as 'open' | 'closed') || undefined;

    const [statusFilter, setStatusFilter] = useState<'open' | 'closed' | ''>(initialStatus || '');
    const [dateFilter, setDateFilter] = useState('');

    const { data: tillsData, isLoading } = useQuery({
        queryKey: ['tills', statusFilter, dateFilter],
        queryFn: () => tillApi.list({
            status: statusFilter || undefined,
            date: dateFilter || undefined,
        }),
    });

    const handleExport = (format: "xlsx" | "pdf" = "xlsx") => {
        if (!tillsData?.results || tillsData.results.length === 0) return;

        (format === "pdf" ? exportToPDF : exportToCSV)(tillsData.results, "till_history", [
            { key: "id", label: "Till ID" },
            { key: "cashier_name", label: "Cashier" },
            { key: "branch_name", label: "Branch" },
            { key: "status", label: "Status" },
            { key: "opening_balance", label: "Opening" },
            { key: "closing_balance", label: "Closing" },
            { key: "variance", label: "Variance" },
            { key: "opened_at", label: "Opened At" },
            { key: "closed_at", label: "Closed At" },
        ]);
    };

    return (
        <div className="space-y-4 min-h-screen p-8">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={() => router.back()}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                    </Button>
                    <h1 className="text-2xl font-bold">Till History</h1>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleExport()}>
                    <Download className="h-4 w-4 mr-2" />
                    Export Excel
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="w-full md:w-64">
                            <select
                                value={statusFilter}

                                onChange={(e) => setStatusFilter(e.target.value as any)}
                                className="w-full px-3 py-2 border border-border rounded-md"
                            >
                                <option value="">All Statuses</option>
                                <option value="open">Open</option>
                                <option value="closed">Closed</option>
                            </select>
                        </div>
                        <div className="w-full md:w-64">
                            <Input
                                type="date"
                                value={dateFilter}
                                onChange={(e) => setDateFilter(e.target.value)}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-center py-8">Loading...</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>ID</TableHead>
                                    <TableHead>Cashier</TableHead>
                                    <TableHead>Branch</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Opened At</TableHead>
                                    <TableHead className="text-right">Opening</TableHead>
                                    <TableHead className="text-right">Closing</TableHead>
                                    <TableHead className="text-right">Variance</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {tillsData?.results?.map((till: Till) => (
                                    <TableRow key={till.id}>
                                        <TableCell className="font-medium">#{till.id}</TableCell>
                                        <TableCell>{till.cashier_name}</TableCell>
                                        <TableCell>{till.branch_name}</TableCell>
                                        <TableCell>
                                            <Badge variant={till.status === 'open' ? 'success' : 'secondary'}>
                                                {till.status.toUpperCase()}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{format(new Date(till.opened_at), 'MMM dd, yyyy HH:mm')}</TableCell>
                                        <TableCell className="text-right font-mono">${till.opening_balance}</TableCell>
                                        <TableCell className="text-right font-mono">
                                            {till.closing_balance ? `$${till.closing_balance}` : '-'}
                                        </TableCell>
                                        <TableCell className={`text-right font-mono ${till.variance && parseFloat(till.variance) < 0 ? 'text-destructive' : ''
                                            }`}>
                                            {till.variance || '-'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Link href={`/billing/tills/${till.id}`}>
                                                <Button variant="ghost" size="sm">
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {(!tillsData?.results || tillsData.results.length === 0) && (
                                    <TableRow>
                                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                                            No tills found matching criteria
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
