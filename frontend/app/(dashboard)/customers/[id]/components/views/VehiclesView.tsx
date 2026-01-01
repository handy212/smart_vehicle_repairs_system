"use client";

import { useQuery } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
import { DataTable } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface VehiclesViewProps {
    customerId: number;
}

export function VehiclesView({ customerId }: VehiclesViewProps) {
    const { data: vehicles = [], isLoading } = useQuery({
        queryKey: ["vehicles", "customer", customerId],
        queryFn: () => customersApi.vehicles(customerId),
    });

    const columns = [
        { header: "Vehicle", accessorKey: "vehicle_display", cell: (item: any) => <Link href={`/vehicles/${item.id}`} className="font-medium text-blue-600 hover:underline">{item.make} {item.model} ({item.year})</Link> },
        { header: "License Plate", accessorKey: "license_plate" },
        { header: "VIN", accessorKey: "vin" },
        { header: "Color", accessorKey: "color" },
        { header: "Mileage", accessorKey: "mileage", cell: (item: any) => item.mileage ? item.mileage.toLocaleString() : "-" },
    ];

    return (
        <div className="space-y-6">
            <DataTable
                data={vehicles}
                columns={columns as any}
                isLoading={isLoading}
                emptyMessage="No vehicles found"
            />
        </div>
    );
}
