"use client";

import { useQuery } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { DataTable } from "@/components/shared/DataTable";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/lib/hooks/useCurrency";

interface PaymentsViewProps {
    customerId: number;
}

export function PaymentsView({ customerId }: PaymentsViewProps) {
    const { formatCurrency } = useCurrency();

    const { data: payments = [], isLoading } = useQuery({
        queryKey: ["payments", "customer", customerId],
        queryFn: () => billingApi.payments.list({ customer: customerId }),
    });

    const columns = [
        { header: "Payment #", accessorKey: "id" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { header: "Date", accessorKey: "payment_date", cell: (item: any) => format(new Date(item.payment_date), "MMM dd, yyyy") },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { header: "Amount", accessorKey: "amount", cell: (item: any) => formatCurrency(parseFloat(item.amount)) },
        { header: "Method", accessorKey: "payment_method" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { header: "Status", accessorKey: "status", cell: (item: any) => <Badge>{item.status}</Badge> }
    ];

    return (
        <div className="space-y-6">
            <DataTable
                data={payments}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                columns={columns as any}
                isLoading={isLoading}
                emptyMessage="No payments found"
            />
        </div>
    );
}
