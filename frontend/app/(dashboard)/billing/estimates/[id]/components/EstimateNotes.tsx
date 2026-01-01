
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { useToast } from "@/lib/hooks/useToast";
import { Save, AlertCircle } from "lucide-react";

interface EstimateNotesProps {
    estimate: any;
}

export function EstimateNotes({ estimate }: EstimateNotesProps) {
    const [internalNotes, setInternalNotes] = useState(estimate.notes || "");
    const [customerNotes, setCustomerNotes] = useState(estimate.customer_notes || "");
    const [activeTab, setActiveTab] = useState("internal");
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const updateNotesMutation = useMutation({
        mutationFn: async (data: { notes?: string; customer_notes?: string }) => {
            return billingApi.estimates.update(estimate.id, data);
        },
        onSuccess: () => {
            toast({
                title: "Notes Updated",
                description: "Estimate notes have been saved successfully.",
                variant: "success",
            });
            queryClient.invalidateQueries({ queryKey: ["estimate", estimate.id] });
        },
        onError: (error) => {
            console.error("Failed to update notes:", error);
            toast({
                title: "Update Failed",
                description: "Failed to save notes. Please try again.",
                variant: "destructive",
            });
        },
    });

    const handleSave = () => {
        updateNotesMutation.mutate({
            notes: internalNotes,
            customer_notes: customerNotes,
        });
    };

    const hasChanges =
        internalNotes !== (estimate.notes || "") ||
        customerNotes !== (estimate.customer_notes || "");

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                    <CardTitle>Estimate Notes</CardTitle>
                </div>
                <Button
                    onClick={handleSave}
                    disabled={!hasChanges || updateNotesMutation.isPending}
                    size="sm"
                >
                    <Save className="w-4 h-4 mr-2" />
                    {updateNotesMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
            </CardHeader>
            <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="mb-4">
                        <TabsTrigger value="internal">Internal Notes</TabsTrigger>
                        <TabsTrigger value="customer">Customer Notes</TabsTrigger>
                    </TabsList>

                    <TabsContent value="internal">
                        <div className="space-y-2">
                            <Textarea
                                value={internalNotes}
                                onChange={(e) => setInternalNotes(e.target.value)}
                                placeholder="Add internal notes about this estimate..."
                                className="min-h-[200px] font-mono text-sm"
                            />
                        </div>
                    </TabsContent>

                    <TabsContent value="customer">
                        <div className="space-y-2">
                            <Textarea
                                value={customerNotes}
                                onChange={(e) => setCustomerNotes(e.target.value)}
                                placeholder="Add notes for the customer (e.g., specific terms)..."
                                className="min-h-[200px]"
                            />
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
