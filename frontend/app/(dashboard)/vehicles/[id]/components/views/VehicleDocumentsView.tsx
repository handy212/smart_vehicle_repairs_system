"use client";

import { DocumentList } from "@/components/documents/DocumentList";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface VehicleDocumentsViewProps {
    vehicleId: number;
}

export function VehicleDocumentsView({ vehicleId }: VehicleDocumentsViewProps) {
    return (
        <Card className="shadow-sm border">
            <CardHeader className="py-3 px-4 border-b bg-gray-50/30">
                <CardTitle className="text-sm font-semibold text-gray-700">Vehicle Documents</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
                <DocumentList vehicleId={vehicleId} />
            </CardContent>
        </Card>
    );
}
