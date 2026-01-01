"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

interface Diagnosis {
    customer_complaint?: string;
    initial_observations?: string;
    [key: string]: any;
}

interface ComplaintTabProps {
    diagnosis: Diagnosis;
    workOrder: any;
    onUpdate: (data: Partial<Diagnosis>) => void;
    isUpdating: boolean;
    isDisabled?: boolean;
}

export function ComplaintTab({
    diagnosis,
    workOrder,
    onUpdate,
    isUpdating,
    isDisabled = false,
}: ComplaintTabProps) {
    // Use work order customer_concerns if diagnosis complaint is empty
    const initialComplaint = diagnosis.customer_complaint || workOrder?.customer_concerns || "";
    const [customerComplaint, setCustomerComplaint] = useState(initialComplaint);
    const [initialObservations, setInitialObservations] = useState(diagnosis.initial_observations || "");

    // Update when diagnosis or work order changes
    React.useEffect(() => {
        const newComplaint = diagnosis.customer_complaint || workOrder?.customer_concerns || "";
        if (newComplaint && !customerComplaint) {
            setCustomerComplaint(newComplaint);
        }
        if (diagnosis.initial_observations !== undefined) {
            setInitialObservations(diagnosis.initial_observations);
        }
    }, [diagnosis.customer_complaint, diagnosis.initial_observations, workOrder?.customer_concerns]);

    const handleSave = () => {
        onUpdate({
            customer_complaint: customerComplaint,
            initial_observations: initialObservations,
        });
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-none shadow-sm bg-gray-50/50 dark:bg-gray-800/50">
                <CardHeader className="pb-3 border-b bg-gray-50/50 dark:bg-gray-800/50">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-gray-700">Customer Complaint</CardTitle>
                    <CardDescription className="text-xs">What the customer reported</CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                    <div className="space-y-4">
                        <Textarea
                            className="min-h-[150px] bg-white dark:bg-gray-900 resize-none focus-visible:ring-1"
                            value={customerComplaint}
                            onChange={(e) => setCustomerComplaint(e.target.value)}
                            placeholder="Enter details about the customer's complaint..."
                            disabled={isDisabled}
                        />
                        <Button onClick={handleSave} disabled={isUpdating || isDisabled} size="sm" className="w-full h-9">
                            {isUpdating ? "Saving..." : "Save Changes"}
                        </Button>
                    </div>
                </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-gray-50/50 dark:bg-gray-800/50">
                <CardHeader className="pb-3 border-b bg-gray-50/50 dark:bg-gray-800/50">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-gray-700">Initial Observations</CardTitle>
                    <CardDescription className="text-xs">Technician's initial visual check</CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                    <Textarea
                        className="min-h-[150px] bg-white dark:bg-gray-900 resize-none focus-visible:ring-1"
                        value={initialObservations}
                        onChange={(e) => setInitialObservations(e.target.value)}
                        placeholder="Record any visual observations or notes..."
                        disabled={isDisabled}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
