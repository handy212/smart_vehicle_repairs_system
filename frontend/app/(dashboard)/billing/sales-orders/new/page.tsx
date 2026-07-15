"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerSelector } from "@/components/customers/CustomerSelector";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";

export default function NewSalesOrderPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [customerId, setCustomerId] = useState<number | undefined>();
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      billingApi.salesOrders.create({
        customer: customerId!,
        reference_number: referenceNumber,
        notes,
        status: "draft",
      }),
    onSuccess: (order) => {
      toast({ title: "Sales order created" });
      router.push(`/billing/sales-orders/${order.id}`);
    },
    onError: (error) => {
      toast({ title: "Failed to create sales order", description: getUserFacingError(error), variant: "destructive" });
    },
  });

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">New Sales Order</h1>
        <p className="mt-1 text-sm text-muted-foreground">Create a commercial order for a customer.</p>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="text-base font-medium">Order Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Customer</Label>
              <CustomerSelector
                selectedCustomerId={customerId}
                onSelect={(customer) => setCustomerId(customer.id)}
                placeholder="Search and select a customer..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reference">Reference Number</Label>
              <Input
                id="reference"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="Optional external reference"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button className="shadow-workshop" onClick={() => createMutation.mutate()} disabled={!customerId || createMutation.isPending}>
              Create Sales Order
            </Button>
            <Button variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
