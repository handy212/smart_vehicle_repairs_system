"use client";

import { useQuery } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { DataTable } from "@/components/shared/DataTable";
import { StatsGrid } from "@/components/shared/StatsGrid";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { FileText, CheckCircle, XCircle, Clock, Send } from "lucide-react";

interface EstimatesViewProps {
    customerId: number;
}

export function EstimatesView({ customerId }: EstimatesViewProps) {
    const { formatCurrency } = useCurrency();

    const { data: estimates = [], isLoading } = useQuery({
        queryKey: ["estimates", "customer", customerId],
        queryFn: () => billingApi.estimates.list({ customer: customerId }).then(res => res.results),
    });

    // Calculate counts
    const counts = {

        draft: estimates.filter((e: any) => e.status === 'draft').length,

        sent: estimates.filter((e: any) => e.status === 'sent').length,

        expired: estimates.filter((e: any) => e.status === 'expired').length,

        declined: estimates.filter((e: any) => e.status === 'declined').length,

        accepted: estimates.filter((e: any) => e.status === 'accepted').length,
    };

    const stats = [
        { label: "Draft", value: counts.draft, icon: FileText },
        { label: "Sent", value: counts.sent, icon: Send, color: "text-primary" },
        { label: "Accepted", value: counts.accepted, icon: CheckCircle, color: "text-success" },
        { label: "Declined", value: counts.declined, icon: XCircle, color: "text-red-600" },
        { label: "Expired", value: counts.expired, icon: Clock, color: "text-primary" },
    ];

    const columns = [

        { header: "Estimate #", accessorKey: "estimate_number", cell: (item: any) => <Link href={`/billing/estimates/${item.id}`} className="text-primary hover:underline">{item.estimate_number}</Link> },

        { header: "Date", accessorKey: "estimate_date", cell: (item: any) => format(new Date(item.estimate_date), "MMM dd, yyyy") },

        { header: "Expiry Date", accessorKey: "expiry_date", cell: (item: any) => item.expiry_date ? format(new Date(item.expiry_date), "MMM dd, yyyy") : "-" },

        { header: "Amount", accessorKey: "total", cell: (item: any) => formatCurrency(parseFloat(item.total)) },

        { header: "Status", accessorKey: "status", cell: (item: any) => <Badge>{item.status}</Badge> }
    ];

    return (
        <div className="space-y-6">
            <StatsGrid stats={stats} columns={4} />
            <DataTable
                data={estimates}

                columns={columns as any}
                isLoading={isLoading}
                emptyMessage="No estimates found"
            />
        </div>
    );
}
