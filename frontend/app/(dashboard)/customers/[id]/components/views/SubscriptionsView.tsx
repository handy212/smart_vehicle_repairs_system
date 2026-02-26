"use client";

import { useQuery } from "@tanstack/react-query";
import { subscriptionsApi } from "@/lib/api/subscriptions";
import { DataTable } from "@/components/shared/DataTable";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { StatsGrid } from "@/components/shared/StatsGrid";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Mail, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

interface SubscriptionsViewProps {
    customerId: number;
}

export function SubscriptionsView({ customerId }: SubscriptionsViewProps) {
    const { formatCurrency } = useCurrency();

    const { data: response = { results: [], count: 0 }, isLoading } = useQuery({
        queryKey: ["subscriptions", "customer", customerId],
        queryFn: () => subscriptionsApi.list({ customer: customerId }),
    });

    const subscriptions = response.results || [];


    const activeCount = subscriptions.filter((s: any) => s.status === 'active').length;

    const expiredCount = subscriptions.filter((s: any) => s.status === 'expired').length;
    const carCount = subscriptions.length;

    const stats = [
        { label: "Total Plans", value: carCount, icon: Mail },
        { label: "Active", value: activeCount, icon: CheckCircle, color: "text-success" },
        { label: "Expired", value: expiredCount, icon: XCircle, color: "text-red-600" },
    ];

    const columns = [

        { header: "Subscription #", accessorKey: "subscription_number", cell: (item: any) => <Link href={`/subscriptions/${item.id}`} className="text-primary hover:underline">{item.subscription_number}</Link> },
        { header: "Plan", accessorKey: "package_name" },

        { header: "Status", accessorKey: "status", cell: (item: any) => <Badge>{item.status}</Badge> },

        { header: "Start Date", accessorKey: "start_date", cell: (item: any) => format(new Date(item.start_date), "MMM dd, yyyy") },

        { header: "End Date", accessorKey: "end_date", cell: (item: any) => format(new Date(item.end_date), "MMM dd, yyyy") },

        { header: "Price", accessorKey: "purchase_price", cell: (item: any) => formatCurrency(parseFloat(item.purchase_price)) },
    ];

    return (
        <div className="space-y-6">
            <StatsGrid stats={stats} columns={3} />
            <DataTable
                data={subscriptions}

                columns={columns as any}
                isLoading={isLoading}
                emptyMessage="No subscriptions found"
            />
        </div>
    );
}
