"use client";

import { useQuery } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { DataTable } from "@/components/shared/DataTable";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useCurrency } from "@/lib/hooks/useCurrency";

interface CreditNotesViewProps {
    customerId: number;
}

export function CreditNotesView({ customerId }: CreditNotesViewProps) {
    const { formatCurrency } = useCurrency();

    const { data: creditNotes = {}, isLoading } = useQuery({
        queryKey: ["credit-notes", "customer", customerId],
        queryFn: () => billingApi.creditNotes.list({ customer: customerId }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = (creditNotes as any).results || [];

    const columns = [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { header: "Credit Note #", accessorKey: "credit_note_number", cell: (item: any) => <Link href={`/billing/credit-notes/${item.id}`} className="text-primary hover:underline">{item.credit_note_number}</Link> },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { header: "Date", accessorKey: "credit_date", cell: (item: any) => format(new Date(item.credit_date), "MMM dd, yyyy") },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { header: "Total", accessorKey: "total", cell: (item: any) => formatCurrency(parseFloat(item.total)) },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { header: "Unused Amount", accessorKey: "unused_amount", cell: (item: any) => formatCurrency(parseFloat(item.unused_amount)) },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { header: "Status", accessorKey: "status", cell: (item: any) => <Badge>{item.status}</Badge> }
    ];

    return (
        <div className="space-y-6">
            <DataTable
                data={results}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                columns={columns as any}
                isLoading={isLoading}
                emptyMessage="No credit notes found"
            />
        </div>
    );
}
