"use client";

import { useQuery } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { DataTable } from "@/components/shared/DataTable";
import { StatsGrid } from "@/components/shared/StatsGrid";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { CreditCard, AlertCircle, CheckCircle } from "lucide-react";

interface InvoicesViewProps {
    customerId: number;
}

export function InvoicesView({ customerId }: InvoicesViewProps) {
    const { formatCurrency } = useCurrency();

    const { data: invoices = [], isLoading } = useQuery({
        queryKey: ["invoices", "customer", customerId],
        queryFn: () => billingApi.invoices.list({ customer: customerId }).then(res => res.results),
    });

    // Calculate stats
    const totalOutstanding = invoices
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((inv: any) => inv.status !== "paid" && inv.status !== "void")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .reduce((acc: number, inv: any) => acc + parseFloat(inv.total), 0);

    const pastDue = invoices
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((inv: any) => {
            const isUnpaid = inv.status !== "paid" && inv.status !== "void";
            const isPastDue = new Date(inv.due_date) < new Date();
            return isUnpaid && isPastDue;
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .reduce((acc: number, inv: any) => acc + parseFloat(inv.total), 0);

    const totalPaid = invoices
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((inv: any) => inv.status === "paid")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .reduce((acc: number, inv: any) => acc + parseFloat(inv.total), 0);

    const stats = [
        {
            label: "Outstanding",
            value: formatCurrency(totalOutstanding),
            icon: CreditCard,
            color: "text-primary"
        },
        {
            label: "Past Due",
            value: formatCurrency(pastDue),
            icon: AlertCircle,
            color: "text-red-600 dark:text-red-400"
        },
        {
            label: "Total Paid",
            value: formatCurrency(totalPaid),
            icon: CheckCircle,
            color: "text-success"
        }
    ];

    const columns = [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { header: "Invoice #", accessorKey: "invoice_number", cell: (item: any) => <Link href={`/billing/invoices/${item.id}`} className="text-primary hover:underline">{item.invoice_number}</Link> },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { header: "Date", accessorKey: "invoice_date", cell: (item: any) => format(new Date(item.invoice_date), "MMM dd, yyyy") },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { header: "Due Date", accessorKey: "due_date", cell: (item: any) => format(new Date(item.due_date), "MMM dd, yyyy") },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { header: "Amount", accessorKey: "total", cell: (item: any) => formatCurrency(parseFloat(item.total)) },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { header: "Balance", accessorKey: "balance", cell: (item: any) => formatCurrency(parseFloat(item.balance)) },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { header: "Status", accessorKey: "status", cell: (item: any) => <Badge>{item.status}</Badge> }
    ];

    return (
        <div className="space-y-6">
            <StatsGrid stats={stats} columns={3} />
            <DataTable
                data={invoices}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                columns={columns as any}
                isLoading={isLoading}
                emptyMessage="No invoices found"
            />
        </div>
    );
}
