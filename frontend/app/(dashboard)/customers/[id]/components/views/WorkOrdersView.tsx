"use client";

import { useQuery } from "@tanstack/react-query";
import { workordersApi } from "@/lib/api/workorders";
import { DataTable } from "@/components/shared/DataTable";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useCurrency } from "@/lib/hooks/useCurrency";

interface WorkOrdersViewProps {
    customerId: number;
}

export function WorkOrdersView({ customerId }: WorkOrdersViewProps) {
    const { formatCurrency } = useCurrency();

    const { data: response = { results: [] }, isLoading } = useQuery({
        queryKey: ["work-orders", "customer", customerId],
        queryFn: () => workordersApi.list({ customer: customerId }),
    });

    const workOrders = response.results || [];

    const columns = [
        { header: "Order #", accessorKey: "order_number", cell: (item: any) => <Link href={`/workorders/${item.id}`} className="text-blue-600 hover:underline">{item.order_number}</Link> },
        { header: "Vehicle", accessorKey: "vehicle_display" },
        { header: "Status", accessorKey: "status", cell: (item: any) => <Badge>{item.status}</Badge> },
        { header: "Created", accessorKey: "created_at", cell: (item: any) => format(new Date(item.created_at), "MMM dd, yyyy") },
        { header: "Due Date", accessorKey: "due_date", cell: (item: any) => item.due_date ? format(new Date(item.due_date), "MMM dd, yyyy") : "-" },
        { header: "Total", accessorKey: "total", cell: (item: any) => item.total ? formatCurrency(parseFloat(item.total)) : "-" },
    ];

    return (
        <div className="space-y-6">
            <DataTable
                data={workOrders}
                columns={columns as any}
                isLoading={isLoading}
                emptyMessage="No work orders found"
            />
        </div>
    );
}
