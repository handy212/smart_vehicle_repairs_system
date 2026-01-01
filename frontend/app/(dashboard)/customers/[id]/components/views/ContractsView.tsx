"use client";

import { useQuery } from "@tanstack/react-query";
import { DataTable } from "@/components/shared/DataTable";
import { customersApi } from "@/lib/api/customers";
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";

interface ContractsViewProps {
    customerId: number;
}

export function ContractsView({ customerId }: ContractsViewProps) {
    // Placeholder for Contracts - likely separate from Subscriptions?
    // If Contracts = Subscriptions, we should redirect or component should be same.
    // Assuming Contracts are legal documents/agreements independent of recurring subs.

    const { data: contracts = [], isLoading } = useQuery({
        queryKey: ["contracts", "customer", customerId],
        queryFn: () => customersApi.contracts.list(customerId),
    });

    const columns = [
        { header: "Contract Title", accessorKey: "title" },
        { header: "Start Date", accessorKey: "start_date" },
        { header: "End Date", accessorKey: "end_date" },
        { header: "Status", accessorKey: "status" },
    ];

    return (
        <div className="space-y-6">
            <Card className="border-dashed shadow-none bg-gray-50/50">
                <CardContent className="flex flex-col items-center justify-center p-12 text-center text-gray-500">
                    <FileText className="w-12 h-12 mb-4 text-gray-300" />
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">No contracts found</h4>
                    <p className="text-sm text-gray-400">Contracts and agreements will appear here.</p>
                </CardContent>
            </Card>

            {contracts.length > 0 && (
                <DataTable
                    data={contracts}
                    columns={columns as any}
                    isLoading={isLoading}
                    emptyMessage="No contracts found"
                />
            )}
        </div>
    );
}
